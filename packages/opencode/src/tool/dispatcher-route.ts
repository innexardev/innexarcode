import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { Dispatcher } from "@opencode-ai/core/pipeline"
import { execFile } from "node:child_process"
import { join } from "node:path"

export const Parameters = Schema.Struct({
  goal: Schema.optional(Schema.String),
  template: Schema.optional(Schema.String),
  files: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  scanDiff: Schema.optional(Schema.Boolean),
})

type Metadata = {
  recommended: string[]
  partitions: number
  phaseAgents: Record<string, string>
}

function gitDiffFiles(cwd: string): Promise<string[]> {
  return new Promise((resolve) => {
    const args = ["diff", "HEAD", "--name-only", "--diff-filter=ACM"]
    execFile("git", args, { cwd, timeout: 15_000 }, (_err, stdout) => {
      const committed = stdout.split("\n").filter(Boolean)
      execFile("git", ["diff", "--cached", "--name-only", "--diff-filter=ACM"], { cwd, timeout: 15_000 }, (_err2, stdout2) => {
        const staged = stdout2.split("\n").filter(Boolean)
        execFile("git", ["ls-files", "--others", "--exclude-standard"], { cwd, timeout: 15_000 }, (_err3, stdout3) => {
          const untracked = stdout3.split("\n").filter(Boolean)
          resolve([...new Set([...committed, ...staged, ...untracked])])
        })
      })
    })
  })
}

export const DispatcherRouteTool = Tool.define<typeof Parameters, Metadata, never>(
  "dispatcher-route",
  Effect.gen(function* () {
    return {
      description:
        "Route the right specialist agents for the current task. Analyzes diff files, project template and goal keywords to recommend specialists (frontend, backend, database, infra, security, mobile, data, qa, design-system, ux-writing, support) and compute safe parallel partitions by top-level directory. Use before implementation to pick agents.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const cwd = process.cwd()
          let files = params.files ?? []
          if (params.scanDiff && files.length === 0) {
            files = yield* Effect.promise(() => gitDiffFiles(cwd))
          }
          const result = Dispatcher.route({
            files,
            template: params.template,
            goal: params.goal,
          })
          return {
            title: "Specialist Routing",
            output: Dispatcher.formatRoute(result, files),
            metadata: {
              recommended: result.recommended.map((s) => s.id),
              partitions: Object.keys(result.partitions).length,
              phaseAgents: result.phaseAgents,
            },
          }
        }),
    } satisfies Tool.DefWithoutID<typeof Parameters, Metadata>
  }),
)