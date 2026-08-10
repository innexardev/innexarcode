import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { Certification } from "@opencode-ai/core/pipeline"

export const Parameters = Schema.Struct({
  specialist: Schema.Literals([
    "security", "backend", "frontend", "database", "infra", "qa-test", "ux-writing",
  ] as const),
})

type Metadata = {
  grade: string
  score: number
  passed: number
  total: number
}

export const SpecialistCertifyTool = Tool.define<typeof Parameters, Metadata, never>(
  "specialist-certify",
  Effect.gen(function* () {
    return {
      description:
        "Certify a specialist agent against curated benchmark tasks (11.8). Each task verifies objective quality criteria in the workspace: required files, code patterns (e.g. input validation, a11y states, indexes, healthchecks), and forbidden patterns (secrets, empty catches, latest images). Returns a grade A-F with per-task detail. Run BEFORE trusting a specialist unsupervised.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const workspace = process.cwd()
          const report = Certification.runCertification(params.specialist, workspace)
          return {
            title: `Certification: ${report.name} — ${report.graded} (${report.score}/100)`,
            output: Certification.formatCertification(report),
            metadata: {
              grade: report.graded,
              score: report.score,
              passed: report.passed,
              total: report.total,
            },
          }
        }),
    } satisfies Tool.DefWithoutID<typeof Parameters, Metadata>
  }),
)