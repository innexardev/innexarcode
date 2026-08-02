import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { serviceUse } from "@opencode-ai/core/effect/service-use"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { ConfigMCPV1 } from "@opencode-ai/core/v1/config/mcp"
import { Config } from "@/config/config"
import { Effect, Layer, Context, Stream } from "effect"
import { EffectBridge } from "@/effect/bridge"
import { InstanceState } from "@/effect/instance-state"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { McpCatalog } from "./catalog"
import type { Tool as MCPToolDef } from "@modelcontextprotocol/sdk/types.js"
import { EventV2Bridge } from "@/event-v2-bridge"

import {
  type MCPClient,
  type State,
  type PromptInfo,
  type ResourceInfo,
  type ResourceTemplateInfo,
  Status,
  Resource,
  ToolsChanged,
  BrowserOpenFailed,
  Failed,
  NotFoundError,
  type McpEntry,
  isMcpConfigured,
  createConnector,
  watchClient,
  closeClient,
  pendingOAuthTransports,
} from "./transport"

import {
  storeClientFn,
  createAndStoreFn,
  startAuthFn,
  authenticateFn,
  finishAuthFn,
  removeAuthFn,
  supportsOAuthFn,
  hasStoredTokensFn,
  getAuthStatusFn,
  requireMcpConfig,
  type AuthStatus,
} from "./oauth-flow"

import { McpBrowser } from "./browser"
import { McpAuth } from "./auth"

export { Resource, Status, ToolsChanged, BrowserOpenFailed, Failed, NotFoundError }

export interface ServerInstructions {
  name: string
  instructions: string
  tools: string[]
}

/** An MCP tool in its native shape; consumers adapt it to their own tool format. */
export interface McpTool {
  /** Shared cached definition; consumers must copy rather than mutate it. */
  readonly def: MCPToolDef
  readonly client: MCPClient
  readonly timeout?: number
}

export interface Interface {
  readonly status: () => Effect.Effect<Record<string, Status>>
  readonly clients: () => Effect.Effect<Record<string, MCPClient>>
  readonly instructions: () => Effect.Effect<ServerInstructions[]>
  readonly tools: () => Effect.Effect<Record<string, McpTool>>
  readonly prompts: () => Effect.Effect<Record<string, PromptInfo & { client: string }>>
  readonly resources: (clientName?: string) => Effect.Effect<Record<string, ResourceInfo & { client: string }>>
  readonly resourceTemplates: (
    clientName?: string,
  ) => Effect.Effect<Record<string, ResourceTemplateInfo & { client: string }>>
  readonly add: (name: string, mcp: ConfigMCPV1.Info) => Effect.Effect<{ status: Record<string, Status> | Status }>
  readonly connect: (name: string) => Effect.Effect<void, NotFoundError>
  readonly disconnect: (name: string) => Effect.Effect<void, NotFoundError>
  readonly getPrompt: (
    clientName: string,
    name: string,
    args?: Record<string, string>,
  ) => Effect.Effect<Awaited<ReturnType<Client["getPrompt"]>> | undefined>
  readonly readResource: (
    clientName: string,
    resourceUri: string,
  ) => Effect.Effect<Awaited<ReturnType<Client["readResource"]>> | undefined>
  readonly startAuth: (
    mcpName: string,
  ) => Effect.Effect<{ authorizationUrl: string; oauthState: string }, NotFoundError>
  readonly authenticate: (
    mcpName: string,
    onAuthorization?: (authorizationUrl: string) => void,
  ) => Effect.Effect<Status, NotFoundError>
  readonly finishAuth: (mcpName: string, authorizationCode: string) => Effect.Effect<Status, NotFoundError>
  readonly removeAuth: (mcpName: string) => Effect.Effect<void>
  readonly supportsOAuth: (mcpName: string) => Effect.Effect<boolean, NotFoundError>
  readonly hasStoredTokens: (mcpName: string) => Effect.Effect<boolean>
  readonly getAuthStatus: (mcpName: string) => Effect.Effect<AuthStatus>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/MCP") {}

export const use = serviceUse(Service)

export type { AuthStatus }

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const auth = yield* McpAuth.Service
    const events = yield* EventV2Bridge.Service
    const browser = yield* McpBrowser.Service

    const descendants = Effect.fnUntraced(
      function* (pid: number) {
        if (process.platform === "win32") return [] as number[]
        const pids: number[] = []
        const queue = [pid]
        for (let index = 0; index < queue.length; index++) {
          const current = queue[index]
          const handle = yield* spawner.spawn(ChildProcess.make("pgrep", ["-P", String(current)], { stdin: "ignore" }))
          const text = yield* Stream.mkString(Stream.decodeText(handle.stdout))
          yield* handle.exitCode
          for (const tok of text.split("\n")) {
            const cpid = parseInt(tok, 10)
            if (!isNaN(cpid) && !pids.includes(cpid)) {
              pids.push(cpid)
              queue.push(cpid)
            }
          }
        }
        return pids
      },
      Effect.scoped,
      Effect.catch(() => Effect.succeed([] as number[])),
    )

    const cfgSvc = yield* Config.Service

    const state = yield* InstanceState.make<State>(
      () =>
        Effect.gen(function* () {
          const cfg = yield* cfgSvc.get()
        const bridge = yield* EffectBridge.make()
        const config = cfg.mcp ?? {}
        const s: State = {
          config: {},
          status: {},
          clients: {},
          defs: {},
          instructions: {},
        }

        yield* Effect.forEach(
          Object.entries(config),
          ([key, mcp]) =>
            Effect.gen(function* () {
              if (!isMcpConfigured(mcp)) {
                yield* Effect.logError("Ignoring MCP config entry without type", { key })
                return
              }

              if (mcp.enabled === false) {
                s.status[key] = { status: "disabled" }
                return
              }

              const result = yield* createConnector(key, mcp, events, auth)
              s.status[key] = result.status
              if (result.mcpClient) {
                s.clients[key] = result.mcpClient
                s.defs[key] = result.defs!
                if (result.instructions) s.instructions[key] = result.instructions
                watchClient(events, s, key, result.mcpClient, bridge, mcp.timeout)
              }
            }),
          { concurrency: "unbounded" },
        )

        yield* Effect.addFinalizer(() =>
          Effect.gen(function* () {
            const clients = Object.values(s.clients)
            s.clients = {}
            s.defs = {}
            s.instructions = {}
            yield* Effect.forEach(
              clients,
              (client) =>
                Effect.gen(function* () {
                  const pid = client.transport instanceof StdioClientTransport ? client.transport.pid : null
                  if (typeof pid === "number") {
                    const pids = yield* descendants(pid)
                    for (const dpid of pids) {
                      try {
                        process.kill(dpid, "SIGTERM")
                      } catch {}
                    }
                  }
                  yield* Effect.tryPromise(() => client.close()).pipe(Effect.ignore)
                }),
              { concurrency: "unbounded" },
            )
            pendingOAuthTransports.clear()
          }),
        )

        return s
      }),
    )

    const status = Effect.fn("MCP.status")(function* () {
      const s = yield* InstanceState.get(state)

      const cfg = yield* cfgSvc.get()
      const config = cfg.mcp ?? {}
      const result: Record<string, Status> = {}

      for (const [key, mcp] of Object.entries(config)) {
        if (!isMcpConfigured(mcp)) continue
        result[key] = s.status[key] ?? { status: "disabled" }
      }

      for (const key of Object.keys(s.config)) {
        result[key] = s.status[key] ?? { status: "disabled" }
      }

      return result
    })

    const clients = Effect.fn("MCP.clients")(function* () {
      const s = yield* InstanceState.get(state)
      return s.clients
    })

    const instructions = Effect.fn("MCP.instructions")(function* () {
      const s = yield* InstanceState.get(state)
      return Object.entries(s.instructions)
        .filter(([name]) => s.status[name]?.status === "connected")
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, item]) => ({
          name,
          instructions: item,
          tools: (s.defs[name] ?? []).map((tool) => McpCatalog.toolName(name, tool.name)),
        }))
    })

    const requestTimeout = (s: State, name: string, configured: McpEntry | undefined, fallback?: number) => {
      const staticTimeout = configured && isMcpConfigured(configured) ? configured.timeout : undefined
      return s.config[name]?.timeout ?? staticTimeout ?? fallback
    }

    const tools = Effect.fn("MCP.tools")(function* () {
      const result: Record<string, McpTool> = {}
      const s = yield* InstanceState.get(state)

      const cfg = yield* cfgSvc.get()
      const config = cfg.mcp ?? {}
      const defaultTimeout = cfg.experimental?.mcp_timeout

      for (const [clientName, client] of Object.entries(s.clients)) {
        if (s.status[clientName]?.status !== "connected") continue
        const mcpConfig = config[clientName]
        const listed = s.defs[clientName]
        if (!listed) {
          yield* Effect.logWarning("missing cached tools for connected server", { clientName })
          continue
        }
        const timeout = requestTimeout(s, clientName, mcpConfig, defaultTimeout)
        for (const def of listed) {
          result[McpCatalog.toolName(clientName, def.name)] = { def, client, timeout }
        }
      }
      return result
    })

    const collectFromConnected = <T extends { name: string }>(
      s: State,
      listFn: (c: Client, timeout?: number) => Promise<T[]>,
      label: string,
      key?: (item: T) => string,
      targetClientName?: string,
    ) =>
      Effect.gen(function* () {
        const cfg = yield* cfgSvc.get()
        return yield* Effect.forEach(
          Object.entries(s.clients).filter(
            ([name]) => s.status[name]?.status === "connected" && (!targetClientName || name === targetClientName),
          ),
          ([clientName, client]) =>
            McpCatalog.fetch(
              clientName,
              client,
              (c) => listFn(c, requestTimeout(s, clientName, cfg.mcp?.[clientName], cfg.experimental?.mcp_timeout)),
              label,
              key,
            ).pipe(Effect.map((items) => Object.entries(items ?? {}))),
          { concurrency: "unbounded" },
        ).pipe(Effect.map((results) => Object.fromEntries<T & { client: string }>(results.flat())))
      })

    const prompts = Effect.fn("MCP.prompts")(function* () {
      return yield* collectFromConnected(yield* InstanceState.get(state), McpCatalog.prompts, "prompts")
    })

    const resources = Effect.fn("MCP.resources")(function* (clientName?: string) {
      return yield* collectFromConnected(
        yield* InstanceState.get(state),
        McpCatalog.resources,
        "resources",
        (resource) => resource.uri,
        clientName,
      )
    })

    const resourceTemplates = Effect.fn("MCP.resourceTemplates")(function* (clientName?: string) {
      return yield* collectFromConnected(
        yield* InstanceState.get(state),
        McpCatalog.resourceTemplates,
        "resource templates",
        (template) => template.uriTemplate,
        clientName,
      )
    })

    const withClient = Effect.fnUntraced(function* <A>(
      clientName: string,
      fn: (client: Client, timeout?: number) => Promise<A>,
      label: string,
      meta?: Record<string, unknown>,
    ) {
      const s = yield* InstanceState.get(state)
      const client = s.clients[clientName]
      if (!client) {
        yield* Effect.logWarning(`client not found for ${label}`, { clientName })
        return undefined
      }
      const cfg = yield* cfgSvc.get()
      return yield* Effect.tryPromise({
        try: () => fn(client, requestTimeout(s, clientName, cfg.mcp?.[clientName], cfg.experimental?.mcp_timeout)),
        catch: (error) => error,
      }).pipe(
        Effect.tapError((error) =>
          Effect.logError(`failed to ${label}`, {
            clientName,
            ...meta,
            error: error instanceof Error ? error.message : String(error),
          }),
        ),
        Effect.orElseSucceed(() => undefined),
      )
    })

    const getPrompt = Effect.fn("MCP.getPrompt")(function* (
      clientName: string,
      name: string,
      args?: Record<string, string>,
    ) {
      return yield* withClient(
        clientName,
        (client, timeout) => client.getPrompt({ name, arguments: args }, { timeout }),
        "getPrompt",
        { promptName: name },
      )
    })

    const readResource = Effect.fn("MCP.readResource")(function* (clientName: string, resourceUri: string) {
      return yield* withClient(
        clientName,
        (client, timeout) => client.readResource({ uri: resourceUri }, { timeout }),
        "readResource",
        { resourceUri },
      )
    })

    const add = Effect.fn("MCP.add")(function* (name: string, mcp: ConfigMCPV1.Info) {
      const s = yield* InstanceState.get(state)
      s.config[name] = mcp
      yield* createAndStoreFn(s, cfgSvc, events, auth, name, mcp)
      return { status: s.status }
    })

    const connect = Effect.fn("MCP.connect")(function* (name: string) {
      const s = yield* InstanceState.get(state)
      const mcpConfig = yield* requireMcpConfig(s, cfgSvc, name)
      yield* createAndStoreFn(s, cfgSvc, events, auth, name, { ...mcpConfig, enabled: true })
    })

    const disconnect = Effect.fn("MCP.disconnect")(function* (name: string) {
      const s = yield* InstanceState.get(state)
      yield* requireMcpConfig(s, cfgSvc, name)
      yield* closeClient(s, name)
      delete s.clients[name]
      s.status[name] = { status: "disabled" }
    })

    // OAuth methods bound to layer services — unwrap InstanceState handle to State
    const startAuth = Effect.fn("MCP.startAuth")(function* (mcpName: string) {
      const s = yield* InstanceState.get(state)
      return yield* startAuthFn(s, cfgSvc, auth)(mcpName)
    })
    const authenticate = Effect.fn("MCP.authenticate")(function* (
      mcpName: string,
      onAuthorization?: (authorizationUrl: string) => void,
    ) {
      const s = yield* InstanceState.get(state)
      return yield* authenticateFn(s, cfgSvc, events, auth, browser)(mcpName, onAuthorization)
    })
    const finishAuth = Effect.fn("MCP.finishAuth")(function* (mcpName: string, authorizationCode: string) {
      const s = yield* InstanceState.get(state)
      return yield* finishAuthFn(s, cfgSvc, events, auth)(mcpName, authorizationCode)
    })
    const removeAuth = removeAuthFn(auth)
    const supportsOAuth = Effect.fn("MCP.supportsOAuth")(function* (mcpName: string) {
      const s = yield* InstanceState.get(state)
      return yield* supportsOAuthFn(s, cfgSvc)(mcpName)
    })
    const hasStoredTokens = hasStoredTokensFn(auth)
    const getAuthStatus = Effect.fn("MCP.getAuthStatus")(function* (mcpName: string) {
      const s = yield* InstanceState.get(state)
      return yield* getAuthStatusFn(s, cfgSvc, auth)(mcpName)
    })

    return Service.of({
      status,
      clients,
      instructions,
      tools,
      prompts,
      resources,
      resourceTemplates,
      add,
      connect,
      disconnect,
      getPrompt,
      readResource,
      startAuth,
      authenticate,
      finishAuth,
      removeAuth,
      supportsOAuth,
      hasStoredTokens,
      getAuthStatus,
    })
  }),
)

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [CrossSpawnSpawner.node, McpAuth.node, EventV2Bridge.node, Config.node, McpBrowser.node],
})

export * as MCP from "./mcp"
