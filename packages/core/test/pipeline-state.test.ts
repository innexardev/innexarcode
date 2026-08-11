import { describe, expect, test } from "bun:test"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PipelineStateMachine, PHASE_ORDER, PHASE_LABELS, PHASE_GATES, statusFromJson, type Phase } from "@opencode-ai/core/pipeline/state"

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

describe("Pipeline workspace isolation", () => {
  test("setWorkspace persists the owning project", () => {
    const sm = new PipelineStateMachine()
    sm.setWorkspace("/srv/project-a")
    expect(sm.getStatus().workspace).toBe("/srv/project-a")
  })

  test("statusFromJson preserves workspace field", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pipeline-ws-test-"))
    const path = join(dir, "state.json")
    const sm = new PipelineStateMachine(path)
    sm.setWorkspace("/srv/project-b")
    sm.startPhase("discovery")
    await sm.save(path)
    const loaded = await PipelineStateMachine.load(path)
    expect(loaded.getStatus().workspace).toBe("/srv/project-b")
    expect(loaded.getStatus().currentPhase).toBe("discovery")
  })

  test("workspace survives save/load roundtrip", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pipeline-ws-test-"))
    const path = join(dir, "state.json")
    const sm = new PipelineStateMachine(path)
    sm.setWorkspace("/srv/project-c")
    await sm.save(path)
    const loaded = await PipelineStateMachine.load(path)
    expect(loaded.getStatus().workspace).toBe("/srv/project-c")
  })
})

describe("Pipeline transition log (P5)", () => {
  test("startPhase records lastTransition with default author", () => {
    const p = new PipelineStateMachine()
    p.startPhase("discovery")
    expect(p.getStatus().lastTransition).toEqual({
      phase: "discovery",
      action: "start",
      by: process.env.USER ?? "unknown",
      at: expect.any(Number) as unknown as number,
    })
  })

  test("completePhase records author and artifact", () => {
    const p = new PipelineStateMachine()
    p.startPhase("discovery")
    p.completePhase("discovery", "release-manager", "memory/architecture.md")
    const s = p.getStatus()
    expect(s.lastTransition?.action).toBe("complete")
    expect(s.lastTransition?.by).toBe("release-manager")
    expect(s.completedArtifacts?.["discovery"]).toBe("memory/architecture.md")
  })

  test("failPhase records transition with action fail", () => {
    const p = new PipelineStateMachine()
    p.startPhase("discovery")
    p.failPhase("discovery", "boom", "qa")
    expect(p.getStatus().lastTransition).toMatchObject({ action: "fail", by: "qa", phase: "discovery" })
  })

  test("lastTransition survives save/load roundtrip", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pipeline-transition-test-"))
    const path = join(dir, "state.json")
    const sm = new PipelineStateMachine(path)
    sm.startPhase("discovery", "tester")
    sm.completePhase("discovery", "tester", "docs/discovery.md")
    await sm.save(path)
    const loaded = await PipelineStateMachine.load(path)
    const s = loaded.getStatus()
    expect(s.lastTransition?.by).toBe("tester")
    expect(s.completedArtifacts?.["discovery"]).toBe("docs/discovery.md")
  })
})

describe("Pipeline status validation (P3)", () => {
  test("statusFromJson rejects out-of-order completedPhases (hand-edited state)", () => {
    const status = {
      currentPhase: null,
      completedPhases: ["discovery", "implementation"],
      failedPhases: [],
      gatesPassed: {},
    }
    expect(statusFromJson(status)).toBeNull()
  })

  test("statusFromJson rejects unknown phase in completedPhases", () => {
    const status = {
      currentPhase: null,
      completedPhases: ["discovery", "bogus"],
      failedPhases: [],
      gatesPassed: {},
    }
    expect(statusFromJson(status)).toBeNull()
  })

  test("statusFromJson rejects non-boolean gatesPassed", () => {
    const status = {
      currentPhase: null,
      completedPhases: [],
      failedPhases: [],
      gatesPassed: { build: "yes" },
    }
    expect(statusFromJson(status)).toBeNull()
  })

  test("statusFromJson rejects duplicate completedPhases", () => {
    const status = {
      currentPhase: null,
      completedPhases: ["discovery", "discovery"],
      failedPhases: [],
      gatesPassed: {},
    }
    expect(statusFromJson(status)).toBeNull()
  })

  test("statusFromJson accepts a valid prefix state", () => {
    const status = {
      currentPhase: null,
      completedPhases: ["discovery", "research"],
      failedPhases: [],
      gatesPassed: {},
    }
    expect(statusFromJson(status)).not.toBeNull()
  })

  test("load discards hand-edited state file and starts fresh", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pipeline-invalid-test-"))
    const path = join(dir, "state.json")
    writeFileSync(
      path,
      JSON.stringify({
        currentPhase: null,
        completedPhases: ["discovery", "implementation"],
        failedPhases: [],
        gatesPassed: {},
        startedAt: 1,
        updatedAt: 1,
      }),
    )
    const sm = await PipelineStateMachine.load(path)
    expect(sm.getStatus().completedPhases).toEqual([])
    expect(sm.getStatus().currentPhase).toBeNull()
  })
})
