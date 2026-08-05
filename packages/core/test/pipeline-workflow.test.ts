import { describe, expect, test } from "bun:test"
import { WorkflowEngine, type DecisionDefinition } from "@opencode-ai/core/pipeline/workflow"
import { PipelineStateMachine } from "@opencode-ai/core/pipeline/state"

function makeEngine(): WorkflowEngine {
  return new WorkflowEngine(new PipelineStateMachine())
}

function makeDecision(partial: Partial<DecisionDefinition>): DecisionDefinition {
  return {
    name: "test-decision",
    prompt: "test prompt",
    criteria: [],
    actions: {},
    ...partial,
  }
}

describe("WorkflowEngine persistence", () => {
  test("run() creates a run and getState returns it with status running", async () => {
    const engine = makeEngine()
    const run = await engine.run("pipeline-1", {
      projectId: "proj-1",
      workspaceId: "ws-1",
      directory: "/tmp",
    })
    expect(run.status).toBe("running")

    const state = await engine.getState(run.id)
    expect(state).not.toBeNull()
    expect(state?.id).toBe(run.id)
    expect(state?.status).toBe("running")
  })

  test("getState returns null for nonexistent run", async () => {
    const engine = makeEngine()
    expect(await engine.getState("nonexistent")).toBeNull()
  })

  test("cancel then resume transitions interrupted -> running and persists", async () => {
    const engine = makeEngine()
    const run = await engine.run("pipeline-1", {
      projectId: "proj-1",
      workspaceId: "ws-1",
      directory: "/tmp",
    })

    await engine.cancel(run.id)
    expect((await engine.getState(run.id))?.status).toBe("interrupted")

    const resumed = await engine.resume(run.id)
    expect(resumed.status).toBe("running")
    expect((await engine.getState(run.id))?.status).toBe("running")
  })

  test("replay sets currentStage and getState reflects it", async () => {
    const engine = makeEngine()
    const run = await engine.run("pipeline-1", {
      projectId: "proj-1",
      workspaceId: "ws-1",
      directory: "/tmp",
    })

    const replayed = await engine.replay(run.id, "qa")
    expect(replayed.currentStage).toBe("qa")
    expect(replayed.status).toBe("running")

    const state = await engine.getState(run.id)
    expect(state?.currentStage).toBe("qa")
    expect(state?.status).toBe("running")
  })

  test("completeStage stores the stage with the right status", async () => {
    const engine = makeEngine()
    const run = await engine.run("pipeline-1", {
      projectId: "proj-1",
      workspaceId: "ws-1",
      directory: "/tmp",
    })

    await engine.completeStage(run.id, "discovery", { ok: true }, "completed")

    const stages = engine.getStages(run.id)
    const completed = stages.find((s) => s.name === "discovery" && s.status === "completed")
    expect(completed).toBeDefined()
    expect(completed?.output).toEqual({ ok: true })
  })

  test("completeStage with failed status stores a failed stage", async () => {
    const engine = makeEngine()
    const run = await engine.run("pipeline-1", {
      projectId: "proj-1",
      workspaceId: "ws-1",
      directory: "/tmp",
    })

    await engine.completeStage(run.id, "review", { error: "boom" }, "failed")

    const stages = engine.getStages(run.id)
    expect(stages.some((s) => s.name === "review" && s.status === "failed")).toBe(true)
  })

  test("listRuns returns all known runs", async () => {
    const engine = makeEngine()
    const a = await engine.run("pipeline-1", { projectId: "p1", workspaceId: "w1", directory: "/tmp" })
    const b = await engine.run("pipeline-2", { projectId: "p2", workspaceId: "w2", directory: "/tmp" })
    const runs = engine.listRuns()
    expect(runs.map((r) => r.id).sort()).toEqual([a.id, b.id].sort())
  })

  test("completeStage advances the pipeline state machine and getNextStage progresses", async () => {
    const state = new PipelineStateMachine()
    const engine = new WorkflowEngine(state)
    const run = await engine.run("pipeline-1", {
      projectId: "proj-1",
      workspaceId: "ws-1",
      directory: "/tmp",
    })

    await engine.completeStage(run.id, "discovery", { ok: true }, "completed")

    expect(state.getStatus().completedPhases).toContain("discovery")
    expect(await engine.getNextStage(run.currentStage)).toBe("research")
  })

  test("completeStage updates the existing stage instead of duplicating it", async () => {
    const engine = makeEngine()
    const run = await engine.run("pipeline-1", {
      projectId: "proj-1",
      workspaceId: "ws-1",
      directory: "/tmp",
    })

    await engine.completeStage(run.id, "discovery", { ok: true }, "completed")
    await engine.completeStage(run.id, "discovery", { ok: true, extra: true }, "completed")

    const stages = engine.getStages(run.id)
    expect(stages.filter((s) => s.name === "discovery")).toHaveLength(1)
    expect(stages.find((s) => s.name === "discovery")?.output).toEqual({ ok: true, extra: true })
  })
})

describe("WorkflowEngine decide", () => {
  test("all criteria satisfied -> continue", async () => {
    const engine = makeEngine()
    const decision = makeDecision({ criteria: ["ok", "flag"] })
    const result = await engine.decide("run-1", decision, { ok: true, flag: 1 })
    expect(result.action).toBe("continue")
    expect(result.reason).toBe("All criteria satisfied")
  })

  test("missing criterion -> escalate with reason containing criterion", async () => {
    const engine = makeEngine()
    const decision = makeDecision({ criteria: ["missing-key"] })
    const result = await engine.decide("run-1", decision, {})
    expect(result.action).toBe("escalate")
    expect(result.reason).toContain("missing-key")
  })

  test("empty criteria -> continue with no criteria defined", async () => {
    const engine = makeEngine()
    const decision = makeDecision({ criteria: [] })
    const result = await engine.decide("run-1", decision, {})
    expect(result.action).toBe("continue")
    expect(result.reason).toBe("No criteria defined")
  })

  test("failing criterion with retry action and no escalate -> retry", async () => {
    const engine = makeEngine()
    const decision = makeDecision({
      criteria: ["broken-key"],
      actions: { retry: "try again" },
    })
    const result = await engine.decide("run-1", decision, {})
    expect(result.action).toBe("retry")
    expect(result.reason).toBe("Retry: broken-key")
  })

  test("failing criterion with escalate action -> escalate", async () => {
    const engine = makeEngine()
    const decision = makeDecision({
      criteria: ["broken-key"],
      actions: { escalate: "human needed" },
    })
    const result = await engine.decide("run-1", decision, {})
    expect(result.action).toBe("escalate")
    expect(result.reason).toContain("broken-key")
  })

  test("criteria with spaces are checked against context like any key", async () => {
    const engine = makeEngine()
    const decision = makeDecision({ criteria: ["some free-form note"] })
    const missing = await engine.decide("run-1", decision, {})
    expect(missing.action).toBe("escalate")
    expect(missing.reason).toContain("some free-form note")

    const satisfied = await engine.decide("run-1", decision, { "some free-form note": true })
    expect(satisfied.action).toBe("continue")
  })
})
