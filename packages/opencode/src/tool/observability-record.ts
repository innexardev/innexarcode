import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { Backlog, Observability } from "@opencode-ai/core/pipeline"
import { homedir } from "node:os"

export const Parameters = Schema.Struct({
  source: Schema.NonEmptyString,
  level: Schema.Literals(["info", "warn", "error"] as const),
  message: Schema.NonEmptyString,
  context: Schema.Record(Schema.String, Schema.Unknown).pipe(Schema.optional),
})

type Metadata = {
  source: string
  level: string
  message: string
}

const homeDir = process.env.HOME ?? homedir()

export const ObservabilityRecordTool = Tool.define<typeof Parameters, Metadata, never>(
  "observability-record",
  Effect.gen(function* () {
    return {
      description:
        "Use to record production/runtime events (info/warn/error); error events auto-create backlog bug items. Duplicate events within the dedupe window are skipped.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const backlog = new Backlog.BacklogEngine(`${homeDir}/.opencode/backlog.json`)
          const eng = new Observability.ObservabilityEngine(`${homeDir}/.opencode/observability.json`, undefined, backlog)
          const event = yield* Effect.promise(() => eng.record(params))
          if (event === null) {
            return {
              title: "Deduplicated",
              output: "Deduplicated (already seen)",
              metadata: { source: params.source, level: params.level, message: params.message },
            }
          }
          return {
            title: "Event Recorded",
            output: `Recorded ${params.level} event from ${params.source}`,
            metadata: { source: params.source, level: params.level, message: params.message },
          }
        }),
    } satisfies Tool.DefWithoutID<typeof Parameters, Metadata>
  }),
)
