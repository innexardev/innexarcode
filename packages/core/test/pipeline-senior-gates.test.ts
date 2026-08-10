import { describe, expect, test } from "bun:test"
import { PipelineStateMachine, PHASE_GATES, type Phase } from "@opencode-ai/core/pipeline/state"
import { PipelineTemplates } from "@opencode-ai/core/pipeline/templates"

describe("Senior DoD gates", () => {
  test("delivery requires polish gate (senior Definition of Done)", () => {
    const deliveryGates = PHASE_GATES["delivery"]
    expect(deliveryGates).toBeDefined()
    expect(deliveryGates).toContain("polish")
  })

  test("review requires lint, types and complexity", () => {
    expect(PHASE_GATES["review"]).toEqual(
      expect.arrayContaining(["lint", "types", "complexity"]),
    )
  })

  test("cannot start delivery without polish gate passed", () => {
    const sm = new PipelineStateMachine()
    const phases: Phase[] = [
      "discovery", "research", "planning", "architecture", "debate",
      "implementation", "review", "qa", "security",
      "self-critique", "question", "audit",
    ]
    for (const p of phases) {
      // pass gates required by each phase so ordering works
      for (const g of PHASE_GATES[p] ?? []) sm.passGate(g)
      expect(sm.startPhase(p).ok).toBe(true)
      expect(sm.completePhase(p).ok).toBe(true)
    }
    // polish gate NOT passed yet -> delivery blocked
    expect(sm.startPhase("delivery").ok).toBe(false)
    sm.passGate("polish")
    expect(sm.startPhase("delivery").ok).toBe(true)
  })

  test("review template includes tech-lead subphase", () => {
    const review = PipelineTemplates.get("web").phases.find((p) => p.id === "review")
    expect(review?.subphases?.map((s) => s.id)).toContain("tech-lead")
  })
})