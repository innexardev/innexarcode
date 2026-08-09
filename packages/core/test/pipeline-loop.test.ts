import { afterAll, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { LoopEngine, converged, type LoopConfig, type WorkResult } from "@opencode-ai/core/pipeline/loop"

const dirs: string[] = []

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

function makePath(): string {
  const dir = mkdtempSync(join(tmpdir(), "loop-engine-"))
  dirs.push(dir)
  return join(dir, "state.json")
}

const fail = async () => ({ ok: false, error: "boom" })
const succeed = async () => ({ ok: true })

describe("LoopEngine", () => {
  test("start creates a running state and a second start throws", async () => {
    const engine = new LoopEngine(makePath())
    const state = await engine.start("Ship the feature")
    expect(state.status).toBe("running")
    expect(state.goal).toBe("Ship the feature")
    expect(state.maxIterations).toBe(3)
    expect(state.iterations).toEqual([])
    expect(state.currentIteration).toBeNull()
    expect(state.finishedAt).toBeNull()
    expect(state.failureCount).toBe(0)
    await expect(engine.start("Another goal")).rejects.toThrow("already running")
  })

  test("successful iteration without criteria completes the loop", async () => {
    const engine = new LoopEngine(makePath())
    await engine.start("goal")
    const state = await engine.runIteration("implementation", succeed)
    expect(state.status).toBe("done")
    expect(state.finishedAt).not.toBeNull()
    expect(state.iterations).toHaveLength(1)
    expect(state.iterations[0].status).toBe("success")
    expect(state.iterations[0].phase).toBe("implementation")
    expect(state.iterations[0].number).toBe(1)
    expect(state.failureCount).toBe(0)
  })

  test("single failure keeps the loop iterating", async () => {
    const engine = new LoopEngine(makePath())
    await engine.start("goal")
    const state = await engine.runIteration("implementation", fail)
    expect(state.status).toBe("iterating")
    expect(state.failureCount).toBe(1)
    expect(state.lastError).toBe("boom")
    expect(state.finishedAt).toBeNull()
    expect(state.iterations[0].status).toBe("failed")
    expect(state.iterations[0].result).toBe("boom")
  })

  test("second failure escalates and fails the loop", async () => {
    const engine = new LoopEngine(makePath())
    await engine.start("goal")
    await engine.runIteration("implementation", fail)
    const state = await engine.runIteration("review", fail)
    expect(state.status).toBe("failed")
    expect(state.failureCount).toBe(2)
    expect(state.finishedAt).not.toBeNull()
    expect(state.iterations).toHaveLength(2)
    expect(state.iterations[1].status).toBe("escalated")
    expect(state.iterations[1].result).toBe("boom")
  })

  test("two failures escalate before max iterations are reached", async () => {
    const engine = new LoopEngine(makePath(), { maxIterations: 2 })
    await engine.start("goal")
    await engine.runIteration("implementation", fail)
    const state = await engine.runIteration("review", fail)
    expect(state.status).toBe("failed")
    expect(state.iterations[1].status).toBe("escalated")
    expect(state.iterations[1].number).toBe(2)
  })

  test("alternating results reach max iterations", async () => {
    const engine = new LoopEngine(makePath(), {
      maxIterations: 2,
      convergenceCriteria: ["tests", "build"],
    })
    await engine.start("goal")
    let ok = false
    const work = async () => {
      ok = !ok
      return ok ? { ok: true, adjustments: { tests: true } } : { ok: false, error: "boom" }
    }
    const first = await engine.runIteration("implementation", work)
    expect(first.status).toBe("running")
    expect(first.finishedAt).toBeNull()
    const state = await engine.runIteration("review", work)
    expect(state.status).toBe("maxIterationsReached")
    expect(state.finishedAt).not.toBeNull()
    expect(state.iterations).toHaveLength(2)
    expect(state.iterations[0].status).toBe("success")
    expect(state.iterations[1].status).toBe("failed")
  })

  test("thrown work errors become failed iterations", async () => {
    const engine = new LoopEngine(makePath())
    await engine.start("goal")
    const state = await engine.runIteration("implementation", async () => {
      throw new Error("exploded")
    })
    expect(state.status).toBe("iterating")
    expect(state.failureCount).toBe(1)
    expect(state.lastError).toBe("exploded")
    expect(state.iterations[0].result).toBe("exploded")
  })

  test("runIteration throws before start and after completion", async () => {
    const engine = new LoopEngine(makePath())
    await expect(engine.runIteration("implementation", succeed)).rejects.toThrow("not started")
    await engine.start("goal")
    await engine.runIteration("implementation", succeed)
    await expect(engine.runIteration("review", succeed)).rejects.toThrow("status is")
  })

  test("checkConvergence requires every criterion to be present and truthy", async () => {
    const engine = new LoopEngine(makePath())
    expect(await engine.checkConvergence(["tests", "build"], { tests: true })).toBe(false)
    expect(await engine.checkConvergence(["tests", "build"], { tests: true, build: true })).toBe(true)
    expect(await engine.checkConvergence(["tests", "build"], { tests: true, build: false })).toBe(false)
    expect(await engine.checkConvergence([], {})).toBe(true)
  })

  test("converged helper returns true when no criteria are defined", () => {
    const config = (criteria: string[]): LoopConfig => ({
      goal: "g",
      maxIterations: 3,
      convergenceCriteria: criteria,
      delayMs: 0,
      maxDiffBytes: 50000,
      tokenBudget: 0,
    })
    expect(converged(config([]), {})).toBe(true)
    expect(converged(config(["tests"]), { tests: true })).toBe(true)
    expect(converged(config(["tests"]), {})).toBe(false)
  })

  test("state persists across engine instances", async () => {
    const path = makePath()
    const engine = new LoopEngine(path)
    await engine.start("goal")
    await engine.runIteration("implementation", succeed)
    const reloaded = new LoopEngine(path)
    const state = await reloaded.status()
    expect(state).not.toBeNull()
    expect(state!.goal).toBe("goal")
    expect(state!.status).toBe("done")
    expect(state!.iterations).toHaveLength(1)
    expect(state!.iterations[0].status).toBe("success")
    expect(state!.currentIteration).toBe(1)
  })

  test("corrupt state file loads as null and does not crash", async () => {
    const path = makePath()
    writeFileSync(path, "{ not valid json")
    const engine = new LoopEngine(path)
    expect(await engine.status()).toBeNull()
    const state = await engine.start("goal")
    expect(state.status).toBe("running")
  })

  test("stop marks a running loop as done", async () => {
    const engine = new LoopEngine(makePath())
    await engine.start("goal")
    const state = await engine.stop()
    expect(state!.status).toBe("done")
    expect(state!.finishedAt).not.toBeNull()
  })

  test("reset clears persisted state", async () => {
    const path = makePath()
    const engine = new LoopEngine(path)
    await engine.start("goal")
    await engine.reset()
    expect(await engine.status()).toBeNull()
    const state = await engine.start("goal")
    expect(state.status).toBe("running")
  })

  test("stop() during work() returns the stopped state without persisting the iteration", async () => {
    const engine = new LoopEngine(makePath())
    await engine.start("goal")
    let workStarted = false
    let resolveWork: (result: WorkResult) => void
    const work = () => {
      workStarted = true
      return new Promise<WorkResult>((resolve) => {
        resolveWork = resolve
      })
    }
    const pending = engine.runIteration("implementation", work)
    while (!workStarted) await Bun.sleep(1)
    const stopped = await engine.stop()
    expect(stopped!.status).toBe("done")
    resolveWork!({ ok: true })
    const state = await pending
    expect(state.status).toBe("done")
    const reloaded = await engine.status()
    expect(reloaded!.status).toBe("done")
    expect(reloaded!.iterations).toHaveLength(0)
  })

  test("lastError is sanitized: stack frames stripped and truncated to 300 chars", async () => {
    const engine = new LoopEngine(makePath())
    await engine.start("goal")
    const state = await engine.runIteration("implementation", async () => ({
      ok: false,
      error:
        "boom\n    at Object.runIteration (/src/pipeline/loop.ts:123)\n    at <anonymous> (/test/x.ts:1)\n" +
        "x".repeat(400),
    }))
    expect(state.lastError).not.toContain("at ")
    expect(state.lastError!.length).toBeLessThanOrEqual(300)
    expect(state.iterations[0].result).toBe(state.lastError)
  })
})

describe("LoopEngine + PipelineStateMachine integration", () => {
  test("successful iteration completes the phase in the pipeline", async () => {
    const { PipelineStateMachine } = await import("@opencode-ai/core/pipeline")
    const sm = await PipelineStateMachine.load(makePath())
    const engine = new LoopEngine(makePath(), {}, sm)
    await engine.start("goal")
    await engine.runIteration("discovery", succeed)
    const status = sm.getStatus()
    expect(status.completedPhases).toContain("discovery")
  })

  test("failure marks the phase failed when it is current", async () => {
    const { PipelineStateMachine } = await import("@opencode-ai/core/pipeline")
    const sm = await PipelineStateMachine.load(makePath())
    sm.startPhase("discovery")
    const engine = new LoopEngine(makePath(), {}, sm)
    await engine.start("goal")
    await engine.runIteration("discovery", fail)
    const status = sm.getStatus()
    expect(status.failedPhases.some((f) => f.phase === "discovery")).toBe(true)
  })

  test("out-of-order phase is rejected by pipeline and iteration fails", async () => {
    const { PipelineStateMachine } = await import("@opencode-ai/core/pipeline")
    const sm = await PipelineStateMachine.load(makePath())
    const engine = new LoopEngine(makePath(), {}, sm)
    await engine.start("goal")
    const state = await engine.runIteration("research", succeed)
    expect(state.iterations[0].status).toBe("failed")
    expect(state.iterations[0].result).toContain("Previous phase")
    expect(sm.getStatus().completedPhases).not.toContain("research")
  })

  test("non-phase names are ignored by pipeline sync", async () => {
    const { PipelineStateMachine } = await import("@opencode-ai/core/pipeline")
    const sm = await PipelineStateMachine.load(makePath())
    const engine = new LoopEngine(makePath(), {}, sm)
    await engine.start("goal")
    const state = await engine.runIteration("custom-step", succeed)
    expect(state.iterations[0].status).toBe("success")
    expect(sm.getStatus().completedPhases).toHaveLength(0)
  })

  test("sequential phases advance the pipeline in order", async () => {
    const { PipelineStateMachine } = await import("@opencode-ai/core/pipeline")
    const sm = await PipelineStateMachine.load(makePath())
    const engine = new LoopEngine(makePath(), { convergenceCriteria: ["done"] }, sm)
    await engine.start("goal")
    await engine.runIteration("discovery", succeed)
    await engine.runIteration("research", succeed)
    await engine.runIteration("planning", async () => ({ ok: true, adjustments: { done: true } }))
    const status = sm.getStatus()
    expect(status.completedPhases).toEqual(["discovery", "research", "planning"])
    const loopState = await engine.status()
    expect(loopState!.status).toBe("done")
  })
})
