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

export const BacklogCompleteTool = Tool.define<typeof Parameters, Metadata, never>(
  "backlog-complete",
  Effect.gen(function* () {
    return {
      description: "Use when a claimed backlog item is finished.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const eng = new Backlog.BacklogEngine(filePath)
          const outcome = yield* Effect.promise(async () => {
            try {
              const item = await eng.complete(params.id)
              return { ok: true as const, item }
            } catch (error) {
              return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
            }
          })
          if (!outcome.ok) {
            return {
              title: "Backlog Complete Failed",
              output: `Could not complete backlog item: ${outcome.error}`,
              metadata: { id: params.id, title: "", status: "" },
            }
          }
          return {
            title: "Backlog Item Completed",
            output: `Completed backlog item: ${outcome.item.title}`,
            metadata: { id: outcome.item.id, title: outcome.item.title, status: outcome.item.status },
          }
        }),
    } satisfies Tool.DefWithoutID<typeof Parameters, Metadata>
  }),
)
