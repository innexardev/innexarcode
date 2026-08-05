import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { Backlog } from "@opencode-ai/core/pipeline"
import { homedir } from "node:os"

export const Parameters = Schema.Struct({
  status: Schema.optional(Schema.Literals(["all", "open", "claimed", "done", "cancelled"] as const)),
})

type Metadata = {
  total: number
  counts: { open: number; claimed: number; done: number; cancelled: number }
}

const filePath = `${process.env.HOME ?? homedir()}/.opencode/backlog.json`

export const BacklogListTool = Tool.define<typeof Parameters, Metadata, never>(
  "backlog-list",
  Effect.gen(function* () {
    return {
      description:
        "Use to review the backlog and its statuses. Optionally filtered by status.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const eng = new Backlog.BacklogEngine(filePath)
          const status = params.status ?? "all"
          const items = yield* Effect.promise(() => eng.list(status))
          const counts = yield* Effect.promise(() => eng.counts())
          if (items.length === 0) {
            return {
              title: "Backlog Empty",
              output: "Backlog empty",
              metadata: { total: 0, counts },
            }
          }
          const output = items
            .map((item) => `- [${item.status}] [${item.priority.toFixed(2)}] [${item.type}] ${item.title}`)
            .join("\n")
          return {
            title: `Backlog (${items.length})`,
            output,
            metadata: { total: items.length, counts },
          }
        }),
    } satisfies Tool.DefWithoutID<typeof Parameters, Metadata>
  }),
)
