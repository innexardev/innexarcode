import path from "node:path"
import fs from "node:fs"
import { pathToFileURL } from "node:url"
import process from "node:process"
import { Client, type ClientOptions } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js"
import {
  ListRootsRequestSchema,
  type LoggingMessageNotification,
  LoggingMessageNotificationSchema,
  type Tool as MCPToolDef,
  ToolListChangedNotificationSchema,
} from "@modelcontextprotocol/sdk/types.js"
import { ConfigV1 } from "@opencode-ai/core/v1/config/config"
import { ConfigMCPV1 } from "@opencode-ai/core/v1/config/mcp"
import { NamedError } from "@opencode-ai/core/util/error"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import { withTimeout } from "@/util/timeout"
import { Cause, Effect, Exit, Schema, Stream } from "effect"
import { EffectBridge } from "@/effect/bridge"
import { InstanceState } from "@/effect/instance-state"
import { McpCatalog } from "./catalog"
import { McpEvent } from "@opencode-ai/schema/mcp-event"
import { TuiEvent } from "@/server/tui-event"
import { EventV2 } from "@opencode-ai/core/event"
import type { McpAuth } from "./auth"
import { McpOAuthProvider } from "./oauth-provider"
import type { McpOAuthPendingProvider } from "./oauth-provider"

const SENSITIVE_ENV_PREFIXES = ["AWS_", "AZURE_", "OPENCODE_", "ANTHROPIC_", "OPENAI_", "GOOGLE_", "OPENROUTER_", "HF_", "MISTRAL_", "GROQ_", "TOGETHER_", "PERPLEXITY_", "COHERE_", "GITLAB_", "AICORE_"]

function filterSensitiveEnv(env: Record<string, string | undefined>, extra: Record<string, string> = {}): Record<string, string> {
  const filtered = Object.fromEntries(
    Object.entries(env).filter(([key]) =>
      !SENSITIVE_ENV_PREFIXES.some(prefix => key.startsWith(prefix)),
    ),
  ) as Record<string, string>
  return { ...filtered, ...extra }
}

export const DEFAULT_TIMEOUT = 30_000
export const CLIENT_OPTIONS = {
  capabilities: {
    roots: {},
  },
} satisfies ClientOptions

export const Resource = Schema.Struct({
  name: Schema.String,
  uri: Schema.String,
  description: Schema.optional(Schema.String),
  mimeType: Schema.optional(Schema.String),
  client: Schema.String,
}).annotate({ identifier: "McpResource" })
export type Resource = Schema.Schema.Type<typeof Resource>

export const ToolsChanged = McpEvent.ToolsChanged
export const BrowserOpenFailed = McpEvent.BrowserOpenFailed

export const Failed = NamedError.create("MCPFailed", {
  name: Schema.String,
})

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("MCP.NotFoundError", {
  name: Schema.String,
}) {}

export type MCPClient = Client

export function createClient(directory: string) {
  const client = new Client({ name: "opencode", version: InstallationVersion }, CLIENT_OPTIONS)
  client.setRequestHandler(ListRootsRequestSchema, () =>
    Promise.resolve({ roots: [{ uri: pathToFileURL(directory).href }] }),
  )
  return client
}

const StatusConnected = Schema.Struct({ status: Schema.Literal("connected") }).annotate({
  identifier: "MCPStatusConnected",
})
const StatusDisabled = Schema.Struct({ status: Schema.Literal("disabled") }).annotate({
  identifier: "MCPStatusDisabled",
})
const StatusFailed = Schema.Struct({ status: Schema.Literal("failed"), error: Schema.String }).annotate({
  identifier: "MCPStatusFailed",
})
const StatusNeedsAuth = Schema.Struct({ status: Schema.Literal("needs_auth") }).annotate({
  identifier: "MCPStatusNeedsAuth",
})
const StatusNeedsClientRegistration = Schema.Struct({
  status: Schema.Literal("needs_client_registration"),
  error: Schema.String,
}).annotate({ identifier: "MCPStatusNeedsClientRegistration" })

export const Status = Schema.Union([
  StatusConnected,
  StatusDisabled,
  StatusFailed,
  StatusNeedsAuth,
  StatusNeedsClientRegistration,
]).annotate({ identifier: "MCPStatus", discriminator: "status" })
export type Status = Schema.Schema.Type<typeof Status>

// Store transports for OAuth servers to allow finishing auth
export type TransportWithAuth = StreamableHTTPClientTransport | SSEClientTransport
export const pendingOAuthTransports = new Map<string, { transport: TransportWithAuth; provider?: McpOAuthProvider | McpOAuthPendingProvider }>()

// Prompt cache types
export type PromptInfo = Awaited<ReturnType<MCPClient["listPrompts"]>>["prompts"][number]
export type ResourceInfo = Awaited<ReturnType<MCPClient["listResources"]>>["resources"][number]
export type ResourceTemplateInfo = Awaited<ReturnType<MCPClient["listResourceTemplates"]>>["resourceTemplates"][number]
export type McpEntry = NonNullable<ConfigV1.Info["mcp"]>[string]

export function isMcpConfigured(entry: McpEntry): entry is ConfigMCPV1.Info {
  return typeof entry === "object" && entry !== null && "type" in entry
}

export function remoteURL(value: string) {
  if (URL.canParse(value)) return new URL(value)
}

export interface CreateResult {
  mcpClient?: MCPClient
  status: Status
  defs?: MCPToolDef[]
  instructions?: string
}

export interface AuthResult {
  authorizationUrl: string
  oauthState: string
  client?: MCPClient
}

export interface State {
  config: Record<string, ConfigMCPV1.Info>
  status: Record<string, Status>
  clients: Record<string, MCPClient>
  defs: Record<string, MCPToolDef[]>
  instructions: Record<string, string>
}

export function serverLog(name: string, params: LoggingMessageNotification["params"]) {
  const fields = { server: name, logger: params.logger, level: params.level, data: params.data }
  switch (params.level) {
    case "debug":
      return Effect.logDebug("MCP server log", fields)
    case "info":
    case "notice":
      return Effect.logInfo("MCP server log", fields)
    case "warning":
      return Effect.logWarning("MCP server log", fields)
    case "error":
    case "critical":
    case "alert":
    case "emergency":
      return Effect.logError("MCP server log", fields)
  }
}

export function watchClient(
  events: EventV2.Interface,
  s: State,
  name: string,
  client: MCPClient,
  bridge: EffectBridge.Shape,
  timeout?: number,
) {
  client.onclose = () => {
    if (s.clients[name] !== client) return
    delete s.clients[name]
    delete s.defs[name]
    delete s.instructions[name]
    s.status[name] = { status: "failed", error: "Connection closed" }
    bridge.fork(
      Effect.logWarning("MCP connection closed", { server: name }).pipe(
        Effect.andThen(events.publish(ToolsChanged, { server: name })),
        Effect.ignore,
      ),
    )
  }

  client.setNotificationHandler(LoggingMessageNotificationSchema, (notification) =>
    bridge.promise(serverLog(name, notification.params)),
  )

  if (!client.getServerCapabilities()?.tools) return
  client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
    if (s.clients[name] !== client || s.status[name]?.status !== "connected") return

    const listed = await bridge.promise(McpCatalog.defs(client, timeout))
    if (!listed) return
    if (s.clients[name] !== client || s.status[name]?.status !== "connected") return

    s.defs[name] = listed
    await bridge.promise(events.publish(ToolsChanged, { server: name }).pipe(Effect.ignore))
  })
}

export function closeClient(s: State, name: string) {
  const client = s.clients[name]
  delete s.clients[name]
  delete s.defs[name]
  delete s.instructions[name]
  if (!client) return Effect.void
  return Effect.tryPromise(() => client.close()).pipe(Effect.ignore)
}

const DISABLED_RESULT: CreateResult = { status: { status: "disabled" } }

export const connectTransport = Effect.fn("MCP.connectTransport")(function* (
  transport: StdioClientTransport | StreamableHTTPClientTransport | SSEClientTransport,
  timeout: number,
) {
  const directory = yield* InstanceState.directory
  return yield* Effect.acquireUseRelease(
    Effect.succeed(transport),
    (t) =>
      Effect.tryPromise({
        try: () => {
          const client = createClient(directory)
          return withTimeout(client.connect(t), timeout).then(() => client)
        },
        catch: (e) => (e instanceof Error ? e : new Error(String(e))),
      }),
    (t, exit) => (Exit.isFailure(exit) ? Effect.tryPromise(() => t.close()).pipe(Effect.ignore) : Effect.void),
  )
})

export const connectRemote = Effect.fn("MCP.connectRemote")(function* (
  key: string,
  mcp: ConfigMCPV1.Info & { type: "remote" },
  auth: McpAuth.Interface,
  events: EventV2.Interface,
) {
  const oauthDisabled = mcp.oauth === false
  const oauthConfig = typeof mcp.oauth === "object" ? mcp.oauth : undefined
  const url = remoteURL(mcp.url)
  if (!url) {
    return {
      client: undefined as MCPClient | undefined,
      status: { status: "failed" as const, error: `Invalid MCP URL for "${key}"` },
    }
  }
  let authProvider: McpOAuthProvider | undefined

  if (!oauthDisabled) {
    authProvider = new McpOAuthProvider(
      key,
      mcp.url,
      {
        clientId: oauthConfig?.clientId,
        clientSecret: oauthConfig?.clientSecret,
        scope: oauthConfig?.scope,
        callbackPort: oauthConfig?.callbackPort,
        redirectUri: oauthConfig?.redirectUri,
      },
      {
        onRedirect: async () => {},
      },
      auth,
    )
  }

  const transports: Array<{ name: string; transport: TransportWithAuth }> = [
    {
      name: "StreamableHTTP",
      transport: new StreamableHTTPClientTransport(url, {
        authProvider,
        requestInit: mcp.headers ? { headers: mcp.headers } : undefined,
      }),
    },
    {
      name: "SSE",
      transport: new SSEClientTransport(url, {
        authProvider,
        requestInit: mcp.headers ? { headers: mcp.headers } : undefined,
      }),
    },
  ]

  const connectTimeout = mcp.timeout ?? DEFAULT_TIMEOUT
  let lastStatus: Status | undefined

  for (const { name, transport } of transports) {
    const result = yield* connectTransport(transport, connectTimeout).pipe(
      Effect.map((client) => ({ client, transportName: name })),
      Effect.catch((error) => {
        const lastError = error instanceof Error ? error : new Error(String(error))
        const isAuthError =
          error instanceof UnauthorizedError || (authProvider && lastError.message.includes("OAuth"))

        if (isAuthError) {
          if (lastError.message.includes("registration") || lastError.message.includes("client_id")) {
            lastStatus = {
              status: "needs_client_registration" as const,
              error: "Server does not support dynamic client registration. Please provide clientId in config.",
            }
            return events
              .publish(TuiEvent.ToastShow, {
                title: "MCP Authentication Required",
                message: `Server "${key}" requires a pre-registered client ID. Add clientId to your config.`,
                variant: "warning",
                duration: 8000,
              })
              .pipe(Effect.ignore, Effect.as(undefined))
          } else {
            pendingOAuthTransports.set(key, { transport })
            lastStatus = { status: "needs_auth" as const }
            return events
              .publish(TuiEvent.ToastShow, {
                title: "MCP Authentication Required",
                message: `Server "${key}" requires authentication. Run: opencode mcp auth ${key}`,
                variant: "warning",
                duration: 8000,
              })
              .pipe(Effect.ignore, Effect.as(undefined))
          }
        }

        lastStatus = { status: "failed" as const, error: lastError.message }
        return Effect.void
      }),
    )
    if (result) return { client: result.client, status: { status: "connected" } as Status }
    if (lastStatus?.status === "needs_auth" || lastStatus?.status === "needs_client_registration") break
  }

  return {
    client: undefined as MCPClient | undefined,
    status: (lastStatus ?? { status: "failed", error: "Unknown error" }) as Status,
  }
})


function resolveCommand(cmd: string): string | null {
  // If absolute path, check if it exists
  if (path.isAbsolute(cmd)) {
    try {
      fs.accessSync(cmd, fs.constants.X_OK)
      return cmd
    } catch { return null }
  }
  // Resolve against PATH
  const pathEnv = process.env.PATH || ""
  const dirs = pathEnv.split(path.delimiter)
  for (const dir of dirs) {
    const full = path.join(dir, cmd)
    try {
      fs.accessSync(full, fs.constants.X_OK)
      return full
    } catch { continue }
  }
  return null
}

export const connectLocal = Effect.fn("MCP.connectLocal")(function* (
  key: string,
  mcp: ConfigMCPV1.Info & { type: "local" },
) {
  const [cmd, ...args] = mcp.command
  const resolved = resolveCommand(cmd)
  if (!resolved) {
    yield* Effect.logWarning("MCP command not found in PATH", { command: cmd })
  } else if (!resolved.startsWith("/usr/") && !resolved.startsWith("/opt/")) {
    yield* Effect.logWarning("MCP command resolved to non-standard path", { command: cmd, resolved })
  }
  const baseDir = yield* InstanceState.directory
  const cwd = mcp.cwd ? path.resolve(baseDir, mcp.cwd) : baseDir
  const transport = new StdioClientTransport({
    stderr: "pipe",
    command: cmd,
    args,
    cwd,
    env: filterSensitiveEnv(
      process.env,
      {
        ...(cmd === "opencode" ? { BUN_BE_BUN: "1" } : {}),
        ...mcp.environment,
      },
    ),
  })

  const connectTimeout = mcp.timeout ?? DEFAULT_TIMEOUT
  return yield* connectTransport(transport, connectTimeout).pipe(
    Effect.map((client): { client: MCPClient | undefined; status: Status } => ({
      client,
      status: { status: "connected" },
    })),
    Effect.catch((error): Effect.Effect<{ client: MCPClient | undefined; status: Status }> => {
      const msg = error instanceof Error ? error.message : String(error)
      return Effect.succeed({ client: undefined, status: { status: "failed", error: msg } })
    }),
  )
})

export const createConnector = Effect.fn("MCP.create")(
  function* (
    key: string,
    mcp: ConfigMCPV1.Info,
    events: EventV2.Interface,
    auth: McpAuth.Interface,
  ) {
    if (mcp.enabled === false) {
      return DISABLED_RESULT
    }

    const { client: mcpClient, status } =
      mcp.type === "remote"
        ? yield* connectRemote(key, mcp as ConfigMCPV1.Info & { type: "remote" }, auth, events)
        : yield* connectLocal(key, mcp as ConfigMCPV1.Info & { type: "local" })

    if (!mcpClient) {
      if (status.status !== "connected" && status.status !== "disabled") {
        yield* Effect.logWarning("server unavailable", { key, type: mcp.type, status: status.status })
      }
      return { status } satisfies CreateResult
    }

    return yield* Effect.gen(function* () {
      const listed = mcpClient.getServerCapabilities()?.tools ? yield* McpCatalog.defs(mcpClient, mcp.timeout) : []
      if (!listed) {
        return yield* Effect.fail(new Error("Failed to get tools"))
      }
      return {
        mcpClient,
        status,
        defs: listed,
        instructions: mcpClient.getInstructions()?.trim(),
      } satisfies CreateResult
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.tryPromise(() => mcpClient.close()).pipe(Effect.ignore, Effect.andThen(Effect.failCause(cause))),
      ),
    )
  },
  Effect.map((result): CreateResult => result),
  Effect.catchCause((cause) => {
    if (Cause.hasInterruptsOnly(cause)) return Effect.interrupt
    const error = Cause.squash(cause)
    return Effect.succeed<CreateResult>({
      status: { status: "failed", error: error instanceof Error ? error.message : String(error) },
    })
  }),
)
