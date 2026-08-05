import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { Backlog } from "@opencode-ai/core/pipeline"
import { homedir } from "node:os"

export const Parameters = Schema.Struct({
  title: Schema.NonEmptyString,
  description: Schema.optional(Schema.String),
  type: Schema.optional(Schema.Literals(["bug", "feature", "tech-debt", "improvement"] as const)),
  source: Schema.optional(Schema.Literals(["manual", "observability", "audit", "self-critique", "loop"] as const)),
  reach: Schema.optional(Schema.Finite),
  impact: Schema.optional(Schema.Finite),
  confidence: Schema.optional(Schema.Finite),
  effort: Schema.optional(Schema.Finite),
})

type Metadata = {
  id: string
  title: string
  priority: number
  status: string
}

const filePath = `${process.env.HOME ?? homedir()}/.opencode/backlog.json`

export const BacklogAddTool = Tool.define<typeof Parameters, Metadata, never>(
  "backlog-add",
  Effect.gen(function* () {
    return {
      description:
        "Use to add a task to the autonomous backlog (bugs found, features, tech debt, improvements). RICE-style scoring (priority = reach × impact × confidence ÷ effort).",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const eng = new Backlog.BacklogEngine(filePath)
          const item = yield* Effect.promise(() => eng.add(params))
          return {
            title: "Backlog Item Added",
            output: `Added backlog item: [${item.type}] ${item.title} (priority=${item.priority.toFixed(2)})`,
            metadata: { id: item.id, title: item.title, priority: item.priority, status: item.status },
          }
        }),
    } satisfies Tool.DefWithoutID<typeof Parameters, Metadata>
  }),
)
