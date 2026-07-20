import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { Pipeline } from "@opencode-ai/core/pipeline"

const PHASE_ORDER = Pipeline.PHASE_ORDER
const PHASE_LABELS = Pipeline.PHASE_LABELS

/** Maps pipeline phase to recommended agent */
const PHASE_AGENT: Record<string, string> = {
  discovery: "explore",
  research: "general",
  planning: "planner",
  architecture: "architect",
  debate: "general",
  implementation: "general",
  review: "code-reviewer",
  qa: "qa",
  security: "security",
  "self-critique": "auditor",
  question: "questionador",
  audit: "auditor",
  delivery: "release-manager",
}

export const Parameters = Schema.Struct({
  phase: Schema.Literal("discovery", "research", "planning", "architecture", "debate", "implementation", "review", "qa", "security", "self-critique", "question", "audit", "delivery").annotate({ description: "The pipeline phase to advance to" }),
  status: Schema.Literal("start", "complete", "fail").annotate({ description: "Status of the phase" }),
  note: Schema.optional(Schema.String).annotate({ description: "Optional note about this phase" }),
})

type Metadata = {
  currentPhase: string
  phaseIndex: number
  totalPhases: number
  nextPhase?: string
  nextAgent?: string
}

export const PipelineAdvanceTool = Tool.define<typeof Parameters, Metadata, never>(
  "pipeline-advance",
  Effect.gen(function* () {
    return {
      description: [
        `Advance the Engineering OS pipeline. Current order:`,
        ...PHASE_ORDER.map((p: string, i: number) => `  ${i + 1}. ${PHASE_LABELS[p]}`),
        ``,
        `Call with status="start" when beginning a phase.`,
        `Call with status="complete" when done. The tool returns the next phase and agent.`,
      ].join("\n"),
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const phaseIdx = PHASE_ORDER.indexOf(params.phase)
          const nextPhase = phaseIdx < PHASE_ORDER.length - 1 ? PHASE_ORDER[phaseIdx + 1] : undefined
          const nextAgent = nextPhase ? PHASE_AGENT[nextPhase] : undefined

          const title = params.status === "start"
            ? `▶ ${PHASE_LABELS[params.phase]}`
            : params.status === "complete"
            ? `✓ ${PHASE_LABELS[params.phase]} → ${nextPhase ? PHASE_LABELS[nextPhase] : "DONE"}`
            : `✗ ${PHASE_LABELS[params.phase]} FAILED`

          const output = [
            `Phase: ${PHASE_LABELS[params.phase]} (${phaseIdx + 1}/${PHASE_ORDER.length})`,
            `Status: ${params.status}`,
            nextPhase ? `Next: ${PHASE_LABELS[nextPhase]} → agent: ${nextAgent}` : "All phases complete!",
            params.note ? `Note: ${params.note}` : "",
          ].filter(Boolean).join("\n")

          return {
            title,
            output,
            metadata: {
              currentPhase: params.phase,
              phaseIndex: phaseIdx,
              totalPhases: PHASE_ORDER.length,
              nextPhase,
              nextAgent,
            },
          }
        }),
    } satisfies Tool.DefWithoutID<typeof Parameters, Metadata>
  }),
)
