import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js"
import type { Tool as MCPToolDef } from "@modelcontextprotocol/sdk/types.js"
import { ConfigMCPV1 } from "@opencode-ai/core/v1/config/mcp"
import { Effect } from "effect"
import { EffectBridge } from "@/effect/bridge"
import { InstanceState } from "@/effect/instance-state"
import { McpOAuthPendingProvider } from "./oauth-provider"
import { OAUTH_CALLBACK_PATH } from "./oauth-provider"
import { McpOAuthCallback } from "./oauth-callback"
import { McpCatalog } from "./catalog"
import type { McpAuth } from "./auth"
import type { McpBrowser } from "./browser"
import type { Config } from "@/config/config"
import { EventV2 } from "@opencode-ai/core/event"
import {
  type MCPClient,
  type State,
  type Status,
  isMcpConfigured,
  remoteURL,
  pendingOAuthTransports,
  createClient,
  watchClient,
  closeClient,
  NotFoundError,
  createConnector,
} from "./transport"

function getMcpConfig(state: State, cfgSvc: Config.Interface, mcpName: string) {
  if (state.config[mcpName]) return Effect.succeed(state.config[mcpName]) as Effect.Effect<ConfigMCPV1.Info>

  return Effect.gen(function* () {
    const cfg = yield* cfgSvc.get()
    const mcpConfig = cfg.mcp?.[mcpName]
    if (!mcpConfig || !isMcpConfigured(mcpConfig)) return undefined as ConfigMCPV1.Info | undefined
    return mcpConfig as ConfigMCPV1.Info
  })
}

export function requireMcpConfig(state: State, cfgSvc: Config.Interface, mcpName: string) {
  return Effect.gen(function* () {
    const mcpConfig = yield* getMcpConfig(state, cfgSvc, mcpName)
    if (!mcpConfig) return yield* new NotFoundError({ name: mcpName })
    return mcpConfig
  })
}

export function storeClientFn(
  state: State,
  name: string,
  client: MCPClient,
  listed: MCPToolDef[],
  instructions: string | undefined,
  timeout: number | undefined,
  events: EventV2.Interface,
) {
  return Effect.gen(function* () {
    const bridge = yield* EffectBridge.make()
    const previous = state.clients[name]
    state.status[name] = { status: "connected" }
    state.clients[name] = client
    state.defs[name] = listed
    if (instructions) state.instructions[name] = instructions
    else delete state.instructions[name]
    watchClient(events, state, name, client, bridge, timeout)
    if (previous) yield* Effect.tryPromise(() => previous.close()).pipe(Effect.ignore)
    return state.status[name]
  }).pipe(Effect.withSpan("MCP.storeClient"))
}

export function createAndStoreFn(
  state: State,
  cfgSvc: Config.Interface,
  events: EventV2.Interface,
  auth: McpAuth.Interface,
  name: string,
  mcp: ConfigMCPV1.Info,
) {
  return Effect.gen(function* () {
    const result = yield* createConnector(name, mcp, events, auth)

    state.status[name] = result.status
    if (!result.mcpClient) {
      yield* closeClient(state, name)
      delete state.clients[name]
      return result.status
    }

    return yield* storeClientFn(state, name, result.mcpClient, result.defs!, result.instructions, mcp.timeout, events)
  }).pipe(Effect.withSpan("MCP.createAndStore"))
}

export function startAuthFn(
  state: State,
  cfgSvc: Config.Interface,
  auth: McpAuth.Interface,
) {
  return Effect.fn("MCP.startAuth")(function* (mcpName: string) {
    const mcpConfig = yield* requireMcpConfig(state, cfgSvc, mcpName)
    if (mcpConfig.type !== "remote") throw new Error(`MCP server ${mcpName} is not a remote server`)
    if (mcpConfig.oauth === false) throw new Error(`MCP server ${mcpName} has OAuth explicitly disabled`)
    const url = remoteURL(mcpConfig.url)
    if (!url) throw new Error(`Invalid MCP URL for "${mcpName}"`)

    const oauthConfig = typeof mcpConfig.oauth === "object" ? mcpConfig.oauth : undefined

    const effectiveRedirectUri =
      oauthConfig?.redirectUri ??
      (oauthConfig?.callbackPort ? `http://127.0.0.1:${oauthConfig.callbackPort}${OAUTH_CALLBACK_PATH}` : undefined)

    yield* Effect.promise(() => McpOAuthCallback.ensureRunning(effectiveRedirectUri))

    const oauthState = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
    yield* auth.updateOAuthState(mcpName, oauthState)
    let capturedUrl: URL | undefined
    const authProvider = new McpOAuthPendingProvider(
      mcpName,
      mcpConfig.url,
      {
        clientId: oauthConfig?.clientId,
        clientSecret: oauthConfig?.clientSecret,
        scope: oauthConfig?.scope,
        redirectUri: effectiveRedirectUri,
      },
      {
        onRedirect: async (url) => {
          capturedUrl = url
        },
      },
      auth,
    )

    const transport = new StreamableHTTPClientTransport(url, {
      authProvider,
      requestInit: mcpConfig.headers ? { headers: mcpConfig.headers } : undefined,
    })
    const directory = yield* InstanceState.directory

    return yield* Effect.tryPromise({
      try: () => {
        const client = createClient(directory)
        return client.connect(transport).then(async () => {
          await authProvider.commit()
          return { authorizationUrl: "", oauthState, client }
        })
      },
      catch: (error) => error,
    }).pipe(
      Effect.catch((error) => {
        if (error instanceof UnauthorizedError && capturedUrl) {
          pendingOAuthTransports.set(mcpName, { transport, provider: authProvider })
          return Effect.succeed({ authorizationUrl: capturedUrl.toString(), oauthState })
        }
        return Effect.die(error)
      }),
    )
  })
}

export function authenticateFn(
  state: State,
  cfgSvc: Config.Interface,
  events: EventV2.Interface,
  auth: McpAuth.Interface,
  browser: McpBrowser.Interface,
) {
  return Effect.fn("MCP.authenticate")(function* (
    mcpName: string,
    onAuthorization?: (authorizationUrl: string) => void,
  ) {
    const startAuth = startAuthFn(state, cfgSvc, auth)
    const result = yield* startAuth(mcpName)
    if (!result.authorizationUrl) {
      const client = "client" in result ? (result as any).client : undefined
      const mcpConfig = yield* requireMcpConfig(state, cfgSvc, mcpName).pipe(
        Effect.tapError(() => Effect.tryPromise(() => client?.close() ?? Promise.resolve()).pipe(Effect.ignore)),
      )

      const listed = client
        ? client.getServerCapabilities()?.tools
          ? yield* McpCatalog.defs(client, mcpConfig.timeout)
          : []
        : undefined
      if (!client || !listed) {
        yield* Effect.tryPromise(() => client?.close() ?? Promise.resolve()).pipe(Effect.ignore)
        return { status: "failed", error: "Failed to get tools" } satisfies Status
      }

      yield* auth.clearOAuthState(mcpName)
      return yield* storeClientFn(state, mcpName, client, listed, client.getInstructions()?.trim(), mcpConfig.timeout, events)
    }

    const callbackPromise = McpOAuthCallback.waitForCallback(result.oauthState, mcpName)
    onAuthorization?.(result.authorizationUrl)

    yield* browser.open(result.authorizationUrl).pipe(
      Effect.catch(() => {
        return events.publish("BrowserOpenFailed" as any, { mcpName, url: result.authorizationUrl }).pipe(Effect.ignore)
      }),
    )

    const code = yield* Effect.promise(() => callbackPromise)

    const storedState = yield* auth.getOAuthState(mcpName)
    if (storedState !== result.oauthState) {
      yield* auth.clearOAuthState(mcpName)
      throw new Error("OAuth state mismatch - potential CSRF attack")
    }
    yield* auth.clearOAuthState(mcpName)
    const finishAuth = finishAuthFn(state, cfgSvc, events, auth)
    return yield* finishAuth(mcpName, code)
  })
}

export function finishAuthFn(
  state: State,
  cfgSvc: Config.Interface,
  events: EventV2.Interface,
  auth: McpAuth.Interface,
) {
  return Effect.fn("MCP.finishAuth")(function* (mcpName: string, authorizationCode: string) {
    yield* requireMcpConfig(state, cfgSvc, mcpName)
    const pending = pendingOAuthTransports.get(mcpName)
    if (!pending) throw new Error(`No pending OAuth flow for MCP server: ${mcpName}`)

    const error = yield* Effect.tryPromise({
      try: () => pending.transport.finishAuth(authorizationCode),
      catch: (error) => error,
    }).pipe(
      Effect.match({
        onFailure: (error) => (error instanceof Error ? error.message : String(error)),
        onSuccess: () => undefined,
      }),
    )

    if (error) return { status: "failed", error: `OAuth completion failed: ${error}` } satisfies Status

    yield* Effect.promise(() => {
      if (pending.provider && "commit" in pending.provider) return (pending.provider as any).commit()
      return Promise.resolve()
    })
    yield* auth.clearCodeVerifier(mcpName)
    pendingOAuthTransports.delete(mcpName)

    const mcpConfig = yield* requireMcpConfig(state, cfgSvc, mcpName)

    return yield* createAndStoreFn(state, cfgSvc, events, auth, mcpName, { ...mcpConfig, enabled: true })
  })
}

export function removeAuthFn(auth: McpAuth.Interface) {
  return Effect.fn("MCP.removeAuth")(function* (mcpName: string) {
    yield* auth.remove(mcpName)
    McpOAuthCallback.cancelPending(mcpName)
    pendingOAuthTransports.delete(mcpName)
  })
}

export function supportsOAuthFn(state: State, cfgSvc: Config.Interface) {
  return Effect.fn("MCP.supportsOAuth")(function* (mcpName: string) {
    const mcpConfig = yield* requireMcpConfig(state, cfgSvc, mcpName)
    return mcpConfig.type === "remote" && mcpConfig.oauth !== false
  })
}

export function hasStoredTokensFn(auth: McpAuth.Interface) {
  return Effect.fn("MCP.hasStoredTokens")(function* (mcpName: string) {
    const entry = yield* auth.get(mcpName)
    return !!entry?.tokens
  })
}

export function getAuthStatusFn(state: State, cfgSvc: Config.Interface, auth: McpAuth.Interface) {
  return Effect.fn("MCP.getAuthStatus")(function* (mcpName: string) {
    const mcpConfig = state.config[mcpName] ?? (yield* cfgSvc.get()).mcp?.[mcpName]
    if (!mcpConfig || !isMcpConfigured(mcpConfig) || mcpConfig.type !== "remote") return "not_authenticated"
    const entry = yield* auth.getForUrl(mcpName, mcpConfig.url)
    if (!entry?.tokens) return "not_authenticated"
    if (entry.tokens.expiresAt && entry.tokens.expiresAt < Date.now() / 1000) return "expired"
    return "authenticated"
  })
}

export type AuthStatus = "authenticated" | "expired" | "not_authenticated"
