import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { Loop, pipelineState } from "@opencode-ai/core/pipeline"
import { homedir } from "node:os"

export const Parameters = Schema.Struct({
  goal: Schema.NonEmptyString,
  maxIterations: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 50 }))),
})

type Metadata = {
  id: string
  status: string
  maxIterations: number
}

const filePath = `${process.env.HOME ?? homedir()}/.opencode/loop-state.json`

export const LoopRunTool = Tool.define<typeof Parameters, Metadata, never>(
  "loop-run",
  Effect.gen(function* () {
    return {
      description:
        "Use when a goal needs iterative improvement until convergence (e.g., fix flaky tests, optimize until a metric is met). The loop is wired to the pipeline state machine: each successful iteration completes its phase; failures can escalate.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const maxIterations = params.maxIterations ?? 3
          const loop = new Loop.LoopEngine(filePath, { maxIterations }, pipelineState)
          const state = yield* Effect.promise(() => loop.start(params.goal))
          return {
            title: "Loop Started",
            output: `Loop started: ${params.goal} (max=${maxIterations})`,
            metadata: { id: state.id, status: state.status, maxIterations: state.maxIterations },
          }
        }),
    } satisfies Tool.DefWithoutID<typeof Parameters, Metadata>
  }),
)
