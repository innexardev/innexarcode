import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { PipelineStateMachine, PHASE_ORDER, PHASE_LABELS, PHASE_GATES, PHASE_AGENT } from "@opencode-ai/core/pipeline/state"
import type { Phase } from "@opencode-ai/core/pipeline/state"

const stateMachine = new PipelineStateMachine()

export const Parameters = Schema.Struct({
  phase: Schema.Literal(
    "discovery", "research", "planning", "architecture", "debate",
    "implementation", "review", "qa", "security",
    "self-critique", "question", "audit", "delivery",
  ).annotate({ description: "The pipeline phase" }),
  status: Schema.Literal("start", "complete", "fail").annotate({ description: "start | complete | fail" }),
  note: Schema.optional(Schema.String).annotate({ description: "Optional note" }),
})

type Metadata = {
  currentPhase: string
  phaseIndex: number
  totalPhases: number
  nextPhase?: string
  nextAgent?: string
  isComplete: boolean
  gatesRequired: string[]
}

export const PipelineAdvanceTool = Tool.define<typeof Parameters, Metadata, never>(
  "pipeline-advance",
  Effect.gen(function* () {
    return {
      description: [
        `Engineering OS Pipeline — phases MUST execute in order.`,
        ``,
        `Phases:`,
        ...PHASE_ORDER.map((p: string, i: number) => `  ${i + 1}. ${PHASE_LABELS[p]}${PHASE_GATES[p] ? ` [gates: ${PHASE_GATES[p].join(", ")}]` : ""}`),
        ``,
        `Call pipeline-advance with status="start" to BEGIN a phase.`,
        `Call pipeline-advance with status="complete" when DONE.`,
        `Call pipeline-advance with status="fail" on ERROR.`,
        ``,
        `PHASES ARE ENFORCED: you cannot skip phases or start out of order.`,
        `Required gates must pass before certain phases.`,
      ].join("\n"),
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const phase = params.phase as Phase
          let result: { ok: boolean; error?: string }

          if (params.status === "start") {
            result = stateMachine.startPhase(phase)
          } else if (params.status === "complete") {
            result = stateMachine.completePhase(phase)
          } else {
            result = stateMachine.failPhase(phase, params.note || "Unknown error")
          }

          const status = stateMachine.getStatus()
          const nextPhase = stateMachine.getNextPhase()
          const nextAgent = nextPhase ? PHASE_AGENT[nextPhase] : undefined
          const isComplete = stateMachine.isComplete()
          const requiredGates = PHASE_GATES[phase] || []

          const title = result.ok
            ? params.status === "start"
              ? `▶ ${PHASE_LABELS[phase]}`
              : params.status === "complete"
              ? `✓ ${PHASE_LABELS[phase]}${nextPhase ? ` → ${PHASE_LABELS[nextPhase]}` : " → ALL DONE!"}`
              : `✗ ${PHASE_LABELS[phase]} FAILED`
            : `✗ ERROR: ${result.error}`

          const lines: string[] = [
            `Phase: ${PHASE_LABELS[phase]} (${status.completedPhases.length + (params.status === "start" ? 1 : 0)}/${PHASE_ORDER.length})`,
            `Status: ${result.ok ? params.status : "rejected"}`,
          ]
          if (!result.ok) lines.push(`Error: ${result.error}`)
          if (result.ok && params.status === "start" && requiredGates.length > 0) {
            lines.push(`Required gates: ${requiredGates.join(", ")}`)
          }
          if (result.ok && params.status === "complete") {
            lines.push(`Completed: ${status.completedPhases.length}/${PHASE_ORDER.length}`)
            if (nextPhase) lines.push(`Next: ${PHASE_LABELS[nextPhase]} → ${nextAgent}`)
            else lines.push("ALL PHASES COMPLETE!")
          }
          if (params.note) lines.push(`Note: ${params.note}`)

          return {
            title,
            output: lines.join("\n"),
            metadata: {
              currentPhase: phase,
              phaseIndex: PHASE_ORDER.indexOf(phase),
              totalPhases: PHASE_ORDER.length,
              nextPhase,
              nextAgent,
              isComplete,
              gatesRequired: requiredGates,
            },
          }
        }),
    } satisfies Tool.DefWithoutID<typeof Parameters, Metadata>
  }),
)
