import { ContextEngine } from "@opencode-ai/core/context-engine"
import { Effect, Schema } from "effect"
import * as Tool from "./tool"

const engineCache = new Map<string, ContextEngine>()

function getEngine(path?: string): ContextEngine {
  if (!path) return new ContextEngine()
  let engine = engineCache.get(path)
  if (!engine) {
    engine = new ContextEngine()
    engineCache.set(path, engine)
  }
  return engine
}

export const Parameters = Schema.Struct({
  command: Schema.Union([
    Schema.Literal("scan"),
    Schema.Literal("query-dependencies"),
    Schema.Literal("query-dependents"),
    Schema.Literal("impact"),
    Schema.Literal("find"),
    Schema.Literal("search-facts"),
    Schema.Literal("add-fact"),
    Schema.Literal("add-technology"),
  ]),
  path: Schema.optional(Schema.String),
  nodeId: Schema.optional(Schema.String),
  name: Schema.optional(Schema.String),
  query: Schema.optional(Schema.String),
  subject: Schema.optional(Schema.String),
  predicate: Schema.optional(Schema.String),
  object: Schema.optional(Schema.String),
})

type Metadata = {
  command: string
  nodeCount?: number
  edgeCount?: number
  resultCount?: number
}

type Command = Schema.Schema.Type<typeof Parameters>["command"]

export const ContextEngineTool = Tool.define<typeof Parameters, Metadata, never>(
  "context-engine",
  Effect.gen(function* () {
    return {
      description: `Query and analyze the project dependency graph. Commands:
- scan: Scan a project and build the dependency graph
- query-dependencies: Get dependencies of a specific node
- query-dependents: Get dependents of a specific node
- impact: Analyze what's affected if a file changes
- find: Find a module by name
- search-facts: Search the knowledge base for facts
- add-fact: Add a knowledge fact
- add-technology: Record a technology decision`,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "context-engine",
            patterns: ["*"],
            always: ["*"],
            metadata: {},
          })

          const engine = getEngine(params.path)
          const command: Command = params.command

          if (command === "scan") {
            if (!params.path) {
              return {
                title: "Error",
                output: "path is required for scan",
                metadata: { command },
              }
            }
            yield* Effect.promise(() => engine.scanProject(params.path!))
            const graph = engine.getGraph()
            return {
              title: `Scanned ${graph.nodes.size} nodes, ${graph.edges.length} edges`,
              output: JSON.stringify(
                { nodeCount: graph.nodes.size, edgeCount: graph.edges.length },
                null,
                2,
              ),
              metadata: { command, nodeCount: graph.nodes.size, edgeCount: graph.edges.length },
            }
          }

          if (command === "query-dependencies") {
            if (!params.nodeId) {
              return {
                title: "Error",
                output: "nodeId is required for query-dependencies",
                metadata: { command },
              }
            }
            const deps = engine.queryDependencies(params.nodeId)
            return {
              title: `${deps.length} dependencies`,
              output: JSON.stringify(deps, null, 2),
              metadata: { command, resultCount: deps.length },
            }
          }

          if (command === "query-dependents") {
            if (!params.nodeId) {
              return {
                title: "Error",
                output: "nodeId is required for query-dependents",
                metadata: { command },
              }
            }
            const deps = engine.queryDependents(params.nodeId)
            return {
              title: `${deps.length} dependents`,
              output: JSON.stringify(deps, null, 2),
              metadata: { command, resultCount: deps.length },
            }
          }

          if (command === "impact") {
            if (!params.nodeId) {
              return {
                title: "Error",
                output: "nodeId is required for impact",
                metadata: { command },
              }
            }
            const impact = engine.impactAnalysis(params.nodeId)
            return {
              title: `${impact.affected.length} affected nodes`,
              output: JSON.stringify(impact, null, 2),
              metadata: { command, resultCount: impact.affected.length },
            }
          }

          if (command === "find") {
            if (!params.name) {
              return {
                title: "Error",
                output: "name is required for find",
                metadata: { command },
              }
            }
            const node = engine.findModule(params.name)
            return {
              title: node ? `Found: ${node.id}` : "Not found",
              output: JSON.stringify(node ?? { error: "not found" }, null, 2),
              metadata: { command, resultCount: node ? 1 : 0 },
            }
          }

          if (command === "search-facts") {
            if (!params.query) {
              return {
                title: "Error",
                output: "query is required for search-facts",
                metadata: { command },
              }
            }
            const facts = engine.searchFacts(params.query)
            return {
              title: `${facts.length} facts found`,
              output: JSON.stringify(facts, null, 2),
              metadata: { command, resultCount: facts.length },
            }
          }

          if (command === "add-fact") {
            if (!params.subject || !params.predicate || !params.object) {
              return {
                title: "Error",
                output: "subject, predicate, and object are required for add-fact",
                metadata: { command },
              }
            }
            engine.addFact(params.subject, params.predicate, params.object)
            return {
              title: "Fact added",
              output: JSON.stringify(
                { subject: params.subject, predicate: params.predicate, object: params.object },
                null,
                2,
              ),
              metadata: { command },
            }
          }

          if (command === "add-technology") {
            if (!params.name) {
              return {
                title: "Error",
                output: "name is required for add-technology",
                metadata: { command },
              }
            }
            engine.addTechnology(params.name, "dependency", "used")
            return {
              title: "Technology recorded",
              output: JSON.stringify({ name: params.name }, null, 2),
              metadata: { command },
            }
          }

          return {
            title: "Error",
            output: `Unknown command: ${command}`,
            metadata: { command },
          }
        }),
    } satisfies Tool.DefWithoutID<typeof Parameters, Metadata>
  }),
)
