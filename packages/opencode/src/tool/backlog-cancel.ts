import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { Backlog } from "@opencode-ai/core/pipeline"
import { homedir } from "node:os"

export const Parameters = Schema.Struct({
  id: Schema.NonEmptyString,
})

type Metadata = {
  id: string
  title: string
  status: string
}

const filePath = `${process.env.HOME ?? homedir()}/.opencode/backlog.json`

export const BacklogCancelTool = Tool.define<typeof Parameters, Metadata, never>(
  "backlog-cancel",
  Effect.gen(function* () {
    return {
      description: "Use when a backlog item is no longer needed.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const eng = new Backlog.BacklogEngine(filePath)
          const outcome = yield* Effect.promise(async () => {
            try {
              const item = await eng.cancel(params.id)
              return { ok: true as const, item }
            } catch (error) {
              return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
            }
          })
          if (!outcome.ok) {
            return {
              title: "Backlog Cancel Failed",
              output: `Could not cancel backlog item: ${outcome.error}`,
              metadata: { id: params.id, title: "", status: "" },
            }
          }
          return {
            title: "Backlog Item Cancelled",
            output: `Cancelled backlog item: ${outcome.item.title}`,
            metadata: { id: outcome.item.id, title: outcome.item.title, status: outcome.item.status },
          }
        }),
    } satisfies Tool.DefWithoutID<typeof Parameters, Metadata>
  }),
)
