import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { MergeCoordinator } from "@opencode-ai/core/pipeline"

export const Parameters = Schema.Struct({
  base: Schema.optional(Schema.String),
  branches: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  testCommand: Schema.optional(Schema.String),
  cleanup: Schema.optional(Schema.Boolean),
})

type Metadata = {
  ok: boolean
  merged: string[]
  conflicted: string[]
  testsPassed: boolean
}

export const MergeCoordinatorTool = Tool.define<typeof Parameters, Metadata, never>(
  "merge-coordinator",
  Effect.gen(function* () {
    return {
      description:
        "Validate integration of parallel feature branches BEFORE merging to main. Simulates the merge in a temp clone, runs the FULL test suite on the merged result (two individually-valid diffs can break together), and reports conflicts. Never touches the real working tree. Use when multiple parallel agents delivered branches.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const report = yield* Effect.promise(() =>
            MergeCoordinator.validateMerge({
              base: params.base,
              branches: params.branches,
              testCommand: params.testCommand,
              cleanup: params.cleanup,
            }),
          )
          return {
            title: report.ok ? "Merge Validation: PASS" : "Merge Validation: FAIL",
            output: MergeCoordinator.formatMergeReport(report),
            metadata: {
              ok: report.ok,
              merged: report.merged,
              conflicted: report.conflicted.map((c) => c.branch),
              testsPassed: report.testsPassed,
            },
          }
        }),
    } satisfies Tool.DefWithoutID<typeof Parameters, Metadata>
  }),
)