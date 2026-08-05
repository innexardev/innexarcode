import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { Backlog } from "@opencode-ai/core/pipeline"
import { homedir } from "node:os"

export const Parameters = Schema.Struct({})

type Metadata = {
  id: string
  title: string
  priority: number
  status: string
}

const filePath = `${process.env.HOME ?? homedir()}/.opencode/backlog.json`

export const BacklogNextTool = Tool.define<typeof Parameters, Metadata, never>(
  "backlog-next",
  Effect.gen(function* () {
    return {
      description:
        "Use when idle with no active task, or to find the highest-priority backlog item to work on next.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const eng = new Backlog.BacklogEngine(filePath)
          const item = yield* Effect.promise(() => eng.next())
          if (!item) {
            return {
              title: "Backlog Empty",
              output: "Backlog empty — no open items",
              metadata: { id: "", title: "", priority: 0, status: "" },
            }
          }
          return {
            title: `Next: ${item.title}`,
            output: `Next item: [${item.priority.toFixed(2)}] [${item.type}] ${item.title}`,
            metadata: { id: item.id, title: item.title, priority: item.priority, status: item.status },
          }
        }),
    } satisfies Tool.DefWithoutID<typeof Parameters, Metadata>
  }),
)
