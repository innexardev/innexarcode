import { describe, expect, test } from "bun:test"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PipelineStateMachine, PHASE_ORDER, PHASE_LABELS, PHASE_GATES, type Phase } from "@opencode-ai/core/pipeline/state"

describe("PipelineStateMachine", () => {
  test("creates initial status with no phases", () => {
    const p = new PipelineStateMachine()
    const s = p.getStatus()
    expect(s.currentPhase).toBeNull()
    expect(s.completedPhases).toEqual([])
    expect(s.failedPhases).toEqual([])
    expect(s.gatesPassed).toEqual({})
    expect(s.startedAt).toBeGreaterThan(0)
  })

  test("isComplete returns false initially", () => {
    const p = new PipelineStateMachine()
    expect(p.isComplete()).toBe(false)
  })

  test("getNextPhase returns first phase", () => {
    const p = new PipelineStateMachine()
    expect(p.getNextPhase()).toBe("discovery")
  })

  test("startPhase succeeds for first phase when no gates required", () => {
    const p = new PipelineStateMachine()
    const result = p.startPhase("discovery")
    expect(result.ok).toBe(true)
    expect(p.getStatus().currentPhase).toBe("discovery")
  })

  test("startPhase fails for unknown phase", () => {
    const p = new PipelineStateMachine()
    const result = p.startPhase("unknown" as Phase)
    expect(result.ok).toBe(false)
    expect(result.error).toContain("Unknown phase")
  })

  test("startPhase fails if previous phase not completed", () => {
    const p = new PipelineStateMachine()
    const result = p.startPhase("implementation")
    expect(result.ok).toBe(false)
    expect(result.error).toContain("not completed")
  })

  test("startPhase fails for already completed phase", () => {
    const p = new PipelineStateMachine()
    p.startPhase("discovery")
    p.completePhase("discovery")
    const result = p.startPhase("discovery")
    expect(result.ok).toBe(false)
    expect(result.error).toContain("already completed")
  })

  test("completePhase fails if phase not started", () => {
    const p = new PipelineStateMachine()
    const result = p.completePhase("discovery")
    expect(result.ok).toBe(false)
    expect(result.error).toContain("not the current phase")
  })

  test("completePhase marks phase as done and clears currentPhase", () => {
    const p = new PipelineStateMachine()
    p.startPhase("discovery")
    const result = p.completePhase("discovery")
    expect(result.ok).toBe(true)
    expect(p.getStatus().completedPhases).toContain("discovery")
    expect(p.getStatus().currentPhase).toBeNull()
  })

  test("completePhase auto-passes build/lint/types gates after implementation", () => {
    const p = new PipelineStateMachine()
    ;["discovery", "research", "planning", "architecture", "debate"].forEach((ph) => {
      p.startPhase(ph as Phase)
      p.completePhase(ph as Phase)
    })
    p.startPhase("implementation")
    p.completePhase("implementation")
    const gates = p.getStatus().gatesPassed
    expect(gates["build"]).toBe(true)
    expect(gates["lint"]).toBe(true)
    expect(gates["types"]).toBe(true)
  })

  test("failPhase records error", () => {
    const p = new PipelineStateMachine()
    p.startPhase("discovery")
    p.failPhase("discovery", "something went wrong")
    expect(p.getStatus().failedPhases).toHaveLength(1)
    expect(p.getStatus().failedPhases[0].phase).toBe("discovery")
    expect(p.getStatus().failedPhases[0].error).toBe("something went wrong")
  })

  test("passGate marks gate as passed", () => {
    const p = new PipelineStateMachine()
    p.passGate("lint")
    expect(p.getStatus().gatesPassed["lint"]).toBe(true)
  })

  test("gates are enforced: qa requires build + types + tests", () => {
    const p = new PipelineStateMachine()
    ;["discovery", "research", "planning", "architecture", "debate", "implementation"].forEach((ph) => {
      p.startPhase(ph as Phase)
      p.completePhase(ph as Phase)
    })
    p.passGate("lint")
    p.passGate("types")
    p.passGate("complexity")
    p.startPhase("review" as Phase)
    p.completePhase("review" as Phase)
    const result = p.startPhase("qa")
    expect(result.ok).toBe(false)
    expect(result.error).toContain("Required gates not passed")
  })

  test("gates pass allows phase start", () => {
    const p = new PipelineStateMachine()
    ;["discovery", "research", "planning", "architecture", "debate", "implementation"].forEach((ph) => {
      p.startPhase(ph as Phase)
      p.completePhase(ph as Phase)
    })
    p.passGate("lint")
    p.passGate("types")
    p.passGate("complexity")
    p.startPhase("review" as Phase)
    p.completePhase("review" as Phase)
    p.passGate("build")
    p.passGate("types")
    p.passGate("tests")
    const result = p.startPhase("qa")
    expect(result.ok).toBe(true)
  })

  test("full pipeline completes successfully", () => {
    const p = new PipelineStateMachine()
    for (const phase of PHASE_ORDER) {
      const gates = PHASE_GATES[phase]
      if (gates) {
        for (const g of gates) p.passGate(g)
      }
      const start = p.startPhase(phase)
      expect(start.ok).toBe(true)
      const complete = p.completePhase(phase)
      expect(complete.ok).toBe(true)
    }
    expect(p.isComplete()).toBe(true)
    expect(p.getNextPhase()).toBeNull()
  })

  test("subscribe receives notifications", () => {
    const p = new PipelineStateMachine()
    let notified = 0
    p.subscribe(() => notified++)
    p.startPhase("discovery")
    expect(notified).toBe(1)
    p.completePhase("discovery")
    expect(notified).toBe(2)
  })

  test("unsubscribe stops notifications", () => {
    const p = new PipelineStateMachine()
    let notified = 0
    const unsub = p.subscribe(() => notified++)
    unsub()
    p.startPhase("discovery")
    expect(notified).toBe(0)
  })

  test("reset clears all state", () => {
    const p = new PipelineStateMachine()
    p.startPhase("discovery")
    p.completePhase("discovery")
    p.reset()
    const s = p.getStatus()
    expect(s.currentPhase).toBeNull()
    expect(s.completedPhases).toEqual([])
    expect(s.failedPhases).toEqual([])
  })

  test("toJSON returns valid JSON string", () => {
    const p = new PipelineStateMachine()
    const json = p.toJSON()
    const parsed = JSON.parse(json)
    expect(parsed.currentPhase).toBeNull()
    expect(parsed.completedPhases).toEqual([])
    expect(parsed.progress).toBe("0/13")
    expect(parsed.isComplete).toBe(false)
  })

  test("toJSON shows next agent after phase start", () => {
    const p = new PipelineStateMachine()
    p.startPhase("discovery")
    p.completePhase("discovery")
    const parsed = JSON.parse(p.toJSON())
    expect(parsed.nextPhase).toBe("Research")
    expect(parsed.nextAgent).toBe("general")
  })

  test("reload with corrupt file keeps current status and does not throw", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pipeline-state-test-"))
    const path = join(dir, "state.json")
    const sm = new PipelineStateMachine(path)
    sm.startPhase("discovery")
    sm.completePhase("discovery")
    await sm.save(path)
    writeFileSync(path, "{ definitely broken json")
    const status = await sm.reload()
    expect(status.completedPhases).toContain("discovery")
    expect(status.currentPhase).toBeNull()
  })

  test("load with corrupt file returns fresh initial status and does not throw", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pipeline-state-test-"))
    const path = join(dir, "state.json")
    writeFileSync(path, "{ definitely broken json")
    const sm = await PipelineStateMachine.load(path)
    expect(sm.getStatus().completedPhases).toEqual([])
    expect(sm.getStatus().currentPhase).toBeNull()
  })
})
