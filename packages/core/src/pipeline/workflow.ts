import { Effect } from "effect"
import { PipelineStateMachine, PHASE_ORDER, type Phase } from "./state"

export type PipelineRunStatus = "pending" | "running" | "completed" | "failed" | "interrupted"

export interface PipelineRunState {
  id: string
  pipelineId: string
  projectId: string
  status: PipelineRunStatus
  currentStage: string | null
  context: Record<string, unknown>
  startedAt: number
  finishedAt: number | null
}

export interface PipelineStageState {
  id: string
  pipelineRunId: string
  name: string
  status: "pending" | "running" | "completed" | "failed" | "skipped"
  output: Record<string, unknown>
  startedAt: number | null
  finishedAt: number | null
  agentId: string | null
}

export interface PipelineTaskState {
  id: string
  pipelineStageId: string
  name: string
  status: "pending" | "running" | "completed" | "failed"
  result: Record<string, unknown>
}

export interface PipelineGateState {
  id: string
  pipelineStageId: string
  name: string
  status: "pending" | "passed" | "failed"
  output: string
  durationMs: number | null
  passedAt: number | null
}

export interface PipelineEventRecord {
  id: string
  pipelineRunId: string
  stage: string | null
  task: string | null
  eventType: string
  data: Record<string, unknown>
  timestamp: number
}

export interface PipelineContext {
  projectId: string
  workspaceId: string
  directory: string
  mission?: string
  input?: unknown
}

export interface DecisionResult {
  action: "continue" | "retry" | "escalate" | "rollback"
  reason: string
  nextStage?: string
  adjustments?: Record<string, unknown>
}

export interface StageDefinition {
  name: string
  agent?: string
  tasks?: TaskDefinition[]
  gates?: GateDefinition[]
  decisions?: DecisionDefinition[]
  on?: {
    complete?: string
    fail?: string
    gateFailed?: string
  }
}

export interface TaskDefinition {
  id: string
  name: string
  tool?: string
  prompt?: string
  retry?: { maxAttempts: number; delayMs: number }
}

export interface GateDefinition {
  name: string
  command: string
  timeout?: number
  retry?: { maxAttempts: number; delayMs: number }
}

export interface DecisionDefinition {
  name: string
  prompt: string
  criteria: string[]
  actions: {
    continue?: string
    retry?: string
    escalate?: string
    rollback?: string
  }
}

export interface PipelineDefinition {
  id: string
  name: string
  version: number
  stages: StageDefinition[]
}

export interface PipelineRunEvents {
  runStarted: (run: PipelineRunState) => void
  stageStarted: (stage: PipelineStageState) => void
  stageCompleted: (stage: PipelineStageState) => void
  stageFailed: (stage: PipelineStageState, error: string) => void
  taskStarted: (task: PipelineTaskState) => void
  taskCompleted: (task: PipelineTaskState) => void
  taskFailed: (task: PipelineTaskState, error: string) => void
  gatePassed: (gate: PipelineGateState) => void
  gateFailed: (gate: PipelineGateState, error: string) => void
  runCompleted: (run: PipelineRunState) => void
  runFailed: (run: PipelineRunState, error: string) => void
  runInterrupted: (run: PipelineRunState) => void
  runCancelled: (run: PipelineRunState) => void
  runResumed: (run: PipelineRunState) => void
  runReplayed: (run: PipelineRunState, fromStage: string) => void
}

/**
 * WorkflowEngine — orchestrates pipeline runs using the PipelineStateMachine singleton.
 *
 * Architecture:
 * - PipelineStateMachine tracks phase-level progress (discovery → delivery)
 * - WorkflowEngine manages per-run state (runs, stages, tasks, gates)
 * - Events are recorded via PipelineEventRecord for audit/replay
 * - Decision logic uses the DecisionResult pattern for human escalation
 */
export class WorkflowEngine {
  private readonly listeners: Partial<PipelineRunEvents> = {}
  private readonly runs: Map<string, PipelineRunState> = new Map()
  private readonly stages: Map<string, PipelineStageState[]> = new Map()

  constructor(
    private readonly pipelineState: PipelineStateMachine,
  ) {}

  on<K extends keyof PipelineRunEvents>(event: K, fn: PipelineRunEvents[K]): void {
    (this.listeners as Record<string, unknown>)[event] = fn
  }

  off<K extends keyof PipelineRunEvents>(event: K): void {
    delete (this.listeners as Record<string, unknown>)[event]
  }

  private emit<K extends keyof PipelineRunEvents>(
    event: K,
    ...args: Parameters<PipelineRunEvents[K]>
  ): void {
    const fn = this.listeners[event]
    if (fn) (fn as (...args: unknown[]) => void)(...args)
  }

  /**
   * Start a new pipeline run. Returns the run ID.
   */
  async run(
    pipelineId: string,
    ctx: PipelineContext,
  ): Promise<PipelineRunState> {
    const run: PipelineRunState = {
      id: crypto.randomUUID(),
      pipelineId,
      projectId: ctx.projectId,
      status: "running",
      currentStage: null,
      context: { ...ctx },
      startedAt: Date.now(),
      finishedAt: null,
    }

    this.runs.set(run.id, run)
    this.emit("runStarted", run)

    const nextStage = await this.getNextStage(null)
    if (nextStage) {
      run.currentStage = nextStage
      const stage: PipelineStageState = {
        id: crypto.randomUUID(),
        pipelineRunId: run.id,
        name: nextStage,
        status: "pending",
        output: {},
        startedAt: null,
        finishedAt: null,
        agentId: null,
      }
      this.recordStage(stage)
      this.emit("stageStarted", stage)
    }

    return run
  }

  /**
   * Resume an interrupted run.
   */
  async resume(runId: string): Promise<PipelineRunState> {
    const run = await this.getState(runId)
    if (!run) throw new Error(`Pipeline run not found: ${runId}`)

    if (run.status !== "interrupted") {
      throw new Error(`Cannot resume run ${runId}: status is ${run.status}, expected "interrupted"`)
    }

    run.status = "running"
    this.runs.set(run.id, run)
    this.emit("runResumed", run)

    const nextStage = await this.getNextStage(run.currentStage)
    if (nextStage) {
      run.currentStage = nextStage
      const stage: PipelineStageState = {
        id: crypto.randomUUID(),
        pipelineRunId: run.id,
        name: nextStage,
        status: "pending",
        output: {},
        startedAt: null,
        finishedAt: null,
        agentId: null,
      }
      this.recordStage(stage)
      this.emit("stageStarted", stage)
    }

    return run
  }

  /**
   * Cancel a running run.
   */
  async cancel(runId: string): Promise<void> {
    const run = await this.getState(runId)
    if (!run) throw new Error(`Pipeline run not found: ${runId}`)

    run.status = "interrupted"
    run.finishedAt = Date.now()
    this.runs.set(run.id, run)
    this.emit("runCancelled", run)
  }

  /**
   * Get current state of a run.
   */
  async getState(runId: string): Promise<PipelineRunState | null> {
    return this.runs.get(runId) ?? null
  }

  /**
   * Get stage records for a run.
   */
  getStages(runId: string): PipelineStageState[] {
    return [...(this.stages.get(runId) ?? [])]
  }

  /**
   * List all known runs.
   */
  listRuns(): PipelineRunState[] {
    return [...this.runs.values()]
  }

  /**
   * Replay a run from a specific stage (e.g., after a fix).
   */
  async replay(runId: string, fromStage: string): Promise<PipelineRunState> {
    const run = await this.getState(runId)
    if (!run) throw new Error(`Pipeline run not found: ${runId}`)

    const fromIdx = PHASE_ORDER.indexOf(fromStage as Phase)
    if (fromIdx !== -1) {
      const existing = this.stages.get(runId) ?? []
      this.stages.set(
        runId,
        existing.filter((s) => {
          const idx = PHASE_ORDER.indexOf(s.name as Phase)
          return idx === -1 || idx < fromIdx
        }),
      )
    }

    run.status = "running"
    run.currentStage = fromStage
    this.runs.set(run.id, run)
    this.emit("runReplayed", run, fromStage)

    const stage: PipelineStageState = {
      id: crypto.randomUUID(),
      pipelineRunId: run.id,
      name: fromStage,
      status: "pending",
      output: {},
      startedAt: null,
      finishedAt: null,
      agentId: null,
    }
    this.recordStage(stage)
    this.emit("stageStarted", stage)

    return run
  }

  /**
   * Record a gate result in the pipeline run audit trail.
   */
  async recordGate(
    runId: string,
    stageId: string,
    gate: { name: string; passed: boolean; output: string; durationMs: number },
  ): Promise<PipelineGateState> {
    const gateState: PipelineGateState = {
      id: crypto.randomUUID(),
      pipelineStageId: stageId,
      name: gate.name,
      status: gate.passed ? "passed" : "failed",
      output: gate.output,
      durationMs: gate.durationMs,
      passedAt: gate.passed ? Date.now() : null,
    }

    if (gate.passed) {
      this.pipelineState.passGate(gate.name)
      this.emit("gatePassed", gateState)
    } else {
      this.emit("gateFailed", gateState, gate.output)
    }

    return gateState
  }

  /**
   * Make a decision at a decision point. Returns action to take.
   */
  async decide(
    _runId: string,
    decision: DecisionDefinition,
    context: Record<string, unknown>,
  ): Promise<DecisionResult> {
    if (decision.criteria.length === 0) {
      return { action: "continue", reason: "No criteria defined" }
    }

    for (const criterion of decision.criteria) {
      if (!Object.hasOwn(context, criterion) || !context[criterion]) {
        if (decision.actions.escalate === undefined && decision.actions.retry !== undefined) {
          return { action: "retry", reason: `Retry: ${criterion}` }
        }
        return {
          action: "escalate",
          reason: `Missing criterion: ${criterion}`,
          nextStage: undefined,
        }
      }
    }

    return { action: "continue", reason: "All criteria satisfied" }
  }

  /**
   * Get the next stage name given the current stage.
   */
  async getNextStage(currentStage: string | null): Promise<Phase | null> {
    const status = this.pipelineState.getStatus()
    const completed = status.completedPhases

    if (completed.length === 0) return "discovery" as Phase

    const lastCompleted = completed[completed.length - 1]
    const lastIdx = PHASE_ORDER.indexOf(lastCompleted as Phase)
    if (lastIdx === -1 || lastIdx >= PHASE_ORDER.length - 1) return null
    return PHASE_ORDER[lastIdx + 1]
  }

  /**
   * Complete a stage and record its output.
   */
  async completeStage(
    runId: string,
    stageName: string,
    output: Record<string, unknown>,
    status: "completed" | "failed" | "skipped" = "completed",
  ): Promise<void> {
    const run = await this.getState(runId)
    if (!run) return

    const stages = this.stages.get(runId) ?? []
    const existing = stages.find((s) => s.name === stageName)
    const stage: PipelineStageState = existing
      ? { ...existing, status, output, finishedAt: Date.now() }
      : {
          id: crypto.randomUUID(),
          pipelineRunId: runId,
          name: stageName,
          status,
          output,
          startedAt: Date.now(),
          finishedAt: Date.now(),
          agentId: null,
        }
    if (existing) {
      this.stages.set(runId, stages.map((s) => (s.id === existing.id ? stage : s)))
    } else {
      this.recordStage(stage)
    }

    if (status === "completed" && PHASE_ORDER.includes(stageName as Phase)) {
      const phase = stageName as Phase
      this.pipelineState.startPhase(phase)
      this.pipelineState.completePhase(phase)
    }

    if (status === "completed") {
      this.emit("stageCompleted", stage)
    } else if (status === "failed") {
      this.emit("stageFailed", stage, String(output.error ?? "Unknown error"))
    }
  }

  private recordStage(stage: PipelineStageState): void {
    const existing = this.stages.get(stage.pipelineRunId) ?? []
    this.stages.set(stage.pipelineRunId, [...existing, stage])
  }
}
