import { randomUUID } from "node:crypto"
import { mkdir, rename, rm, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname } from "node:path"
import { Option, Schema } from "effect"
import { PHASE_ORDER, type Phase } from "./state"
import type { PipelineStateMachine } from "./state"

export const LoopStatus = Schema.Union([
  Schema.Literal("idle"),
  Schema.Literal("running"),
  Schema.Literal("iterating"),
  Schema.Literal("done"),
  Schema.Literal("failed"),
  Schema.Literal("maxIterationsReached"),
])
export type LoopStatus = typeof LoopStatus.Type

export interface LoopConfig {
  goal: string
  maxIterations: number
  convergenceCriteria: string[]
  delayMs: number
  maxDiffBytes: number
  tokenBudget: number
}

export const LoopIteration = Schema.Struct({
  number: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  phase: Schema.String,
  status: Schema.Union([
    Schema.Literal("success"),
    Schema.Literal("failed"),
    Schema.Literal("escalated"),
  ]),
  adjustments: Schema.Record(Schema.String, Schema.Unknown),
  durationMs: Schema.Number,
  timestamp: Schema.Number,
  result: Schema.optional(Schema.String),
  diffSize: Schema.optional(Schema.Number),
})
export type LoopIteration = typeof LoopIteration.Type

export const LoopState = Schema.Struct({
  id: Schema.String,
  goal: Schema.String,
  status: LoopStatus,
  maxIterations: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  iterations: Schema.Array(LoopIteration),
  currentIteration: Schema.optional(Schema.NullOr(Schema.Int)),
  startedAt: Schema.Number,
  finishedAt: Schema.optional(Schema.NullOr(Schema.Number)),
  failureCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  lastError: Schema.optional(Schema.String),
  diffSizes: Schema.optional(Schema.Array(Schema.Number)),
  escalationContext: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  tokensUsed: Schema.optional(Schema.Number),
})
export type LoopState = typeof LoopState.Type

export interface WorkResult {
  ok: boolean
  error?: string
  adjustments?: Record<string, unknown>
}

const DEFAULT_CONFIG: LoopConfig = {
  goal: "",
  maxIterations: 3,
  convergenceCriteria: [],
  delayMs: 0,
  maxDiffBytes: 50000,
  tokenBudget: 0,
}

export function converged(config: LoopConfig, results: Record<string, unknown>): boolean {
  const criteria = config.convergenceCriteria
  if (criteria.length === 0 && (config.maxDiffBytes === 0 || config.maxDiffBytes === undefined)) return true
  const criteriaMet = criteria.length === 0 || criteria.every((c) => Object.hasOwn(results, c) && Boolean(results[c]))
  // diff shrinking is optional — only enforced when work reports diffSize
  const diffMet =
    config.maxDiffBytes === 0 ||
    config.maxDiffBytes === undefined ||
    typeof results.diffSize !== "number" ||
    results.diffSize < config.maxDiffBytes
  return criteriaMet && diffMet
}

function normalizeConfig(config: Partial<LoopConfig>): LoopConfig {
  const maxIterations = config.maxIterations ?? DEFAULT_CONFIG.maxIterations
  if (!Number.isInteger(maxIterations) || maxIterations < 1) {
    throw new Error(`maxIterations must be a positive integer, got ${String(config.maxIterations)}`)
  }
  return {
    goal: config.goal ?? DEFAULT_CONFIG.goal,
    maxIterations,
    convergenceCriteria: config.convergenceCriteria ?? DEFAULT_CONFIG.convergenceCriteria,
    delayMs: config.delayMs ?? DEFAULT_CONFIG.delayMs,
    maxDiffBytes: config.maxDiffBytes ?? DEFAULT_CONFIG.maxDiffBytes,
    tokenBudget: config.tokenBudget ?? DEFAULT_CONFIG.tokenBudget,
  }
}

export class LoopEngine {
  readonly config: LoopConfig
  private readonly pipeline?: PipelineStateMachine

  constructor(
    private readonly filePath: string = `${homedir()}/.opencode/loop-state.json`,
    config: Partial<LoopConfig> = {},
    pipeline?: PipelineStateMachine,
  ) {
    this.config = normalizeConfig(config)
    this.pipeline = pipeline
  }

  /**
   * Sync the phase with the pipeline state machine when one is connected:
   * - success: startPhase + completePhase (validates order and gates)
   * - failure: failPhase when the phase is the current one
   * Returns an error string when the pipeline rejected the transition.
   */
  private async syncPipeline(phase: string, ok: boolean, error?: string): Promise<string | undefined> {
    if (!this.pipeline || !PHASE_ORDER.includes(phase as Phase)) return undefined
    const p = phase as Phase
    const status = this.pipeline.getStatus()
    if (status.completedPhases.includes(p)) return undefined
    if (ok) {
      const start = this.pipeline.startPhase(p)
      if (!start.ok) return start.error ?? "startPhase failed"
      const done = this.pipeline.completePhase(p)
      if (!done.ok) return done.error ?? "completePhase failed"
      return undefined
    }
    if (status.currentPhase === p) {
      this.pipeline.failPhase(p, error ?? "iteration failed")
    }
    return undefined
  }

  async start(goal: string): Promise<LoopState> {
    const existing = await this.status()
    if (existing && (existing.status === "running" || existing.status === "iterating")) {
      throw new Error(`Loop already running with goal "${existing.goal}"`)
    }
    if (goal.length < 1) throw new Error("goal must be at least 1 character")
    const state: LoopState = {
      id: crypto.randomUUID(),
      goal,
      status: "running",
      maxIterations: this.config.maxIterations,
      iterations: [],
      currentIteration: null,
      startedAt: Date.now(),
      finishedAt: null,
      failureCount: 0,
      diffSizes: [],
      escalationContext: undefined,
      tokensUsed: 0,
    }
    await this.persist(state)
    return state
  }

  async runIteration(phase: string, work: () => Promise<WorkResult>): Promise<LoopState> {
    const state = await this.status()
    if (!state) throw new Error("Loop not started. Call start(goal) first.")
    if (state.status !== "running" && state.status !== "iterating") {
      throw new Error(`Cannot run iteration: loop status is "${state.status}"`)
    }

    const startedAt = Date.now()
    const result = await runWork(work)
    const timestamp = Date.now()

    const current = await this.status()
    if (current && current.status !== "running" && current.status !== "iterating") {
      return current
    }

    // Sync with the pipeline state machine (start/complete/fail phase)
    const pipelineError = await this.syncPipeline(phase, result.ok, result.error)
    const workResult = pipelineError
      ? { ok: false, error: pipelineError, adjustments: result.adjustments }
      : result

    // Track tokens used
    let tokensUsed = state.tokensUsed ?? 0
    if (result.adjustments?.tokensUsed != null && typeof result.adjustments.tokensUsed === "number") {
      tokensUsed += result.adjustments.tokensUsed
    }

    // Check token budget
    let budgetExceeded = false
    if (this.config.tokenBudget > 0 && tokensUsed > this.config.tokenBudget) {
      budgetExceeded = true
      workResult.ok = false
      workResult.error = "token budget exceeded"
    }

    const number = (state.currentIteration ?? 0) + 1
    const escalated = !workResult.ok && state.failureCount + 1 >= 2
    const error = workResult.ok ? undefined : sanitizeError(workResult.error ?? "Unknown error")

    // Track diff size
    const diffSize =
      result.adjustments?.diffSize != null && typeof result.adjustments.diffSize === "number"
        ? result.adjustments.diffSize
        : undefined

    const iteration: LoopIteration = {
      number,
      phase,
      status: escalated ? "escalated" : workResult.ok ? "success" : "failed",
      adjustments: workResult.adjustments ?? {},
      durationMs: timestamp - startedAt,
      timestamp,
      result: error,
      diffSize,
    }

    // Build escalation context on escalation
    let escalationContext = state.escalationContext
    if (escalated && !escalationContext) {
      escalationContext = {
        goal: state.goal,
        phase,
        iterations: state.iterations.slice(-2).map((i) => ({
          number: i.number,
          phase: i.phase,
          status: i.status,
          result: i.result,
        })),
        failureReason: error,
        attempts: state.failureCount + 1,
      }
    }

    // Track diff sizes
    const diffSizes = [...(state.diffSizes ?? [])]
    if (diffSize != null) {
      diffSizes.push(diffSize)
    }

    const status = transition(
      workResult,
      escalated,
      converged(this.config, { ...iteration.adjustments, diffSize }),
      number,
      state.maxIterations,
    )
    const next: LoopState = {
      ...state,
      status,
      iterations: [...state.iterations, iteration],
      currentIteration: number,
      finishedAt: status === "running" || status === "iterating" ? null : timestamp,
      failureCount: workResult.ok ? 0 : state.failureCount + 1,
      lastError: workResult.ok ? state.lastError : error,
      diffSizes,
      escalationContext,
      tokensUsed,
    }

    await this.persist(next)
    return next
  }

  async getEscalationReport(): Promise<string | null> {
    const state = await this.status()
    const ctx = state?.escalationContext
    if (!ctx || typeof ctx.goal !== "string") return null
    const lines = [
      "=== Loop Escalation Report ===",
      `Goal: ${ctx.goal}`,
      `Phase: ${String(ctx.phase ?? "unknown")}`,
      `Attempts: ${String(ctx.attempts ?? 0)}`,
      `Failure Reason: ${String(ctx.failureReason ?? "unknown")}`,
      "",
      "Recent Iterations:",
    ]
    const iterations = ctx.iterations
    if (Array.isArray(iterations)) {
      for (const iter of iterations) {
        lines.push(
          `  #${String(iter?.number ?? "?")} [${String(iter?.phase ?? "?")}] ${String(iter?.status ?? "?")}${iter?.result ? ` — ${String(iter.result)}` : ""}`,
        )
      }
    }
    return lines.join("\n")
  }

  async checkConvergence(criteria: string[], results: Record<string, unknown>): Promise<boolean> {
    return criteria.every((c) => Object.hasOwn(results, c) && Boolean(results[c]))
  }

  async status(): Promise<LoopState | null> {
    return this.loadState()
  }

  async stop(): Promise<LoopState | null> {
    const state = await this.status()
    if (state && (state.status === "running" || state.status === "iterating")) {
      const next: LoopState = { ...state, status: "done", finishedAt: Date.now() }
      await this.persist(next)
      return next
    }
    return state
  }

  async reset(): Promise<void> {
    await rm(this.filePath, { force: true })
  }

  private async persist(state: LoopState): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    const tmp = `${this.filePath}.${randomUUID()}.tmp`
    await writeFile(tmp, JSON.stringify(state, null, 2), { flag: "wx" })
    await rename(tmp, this.filePath)
  }

  private async loadState(): Promise<LoopState | null> {
    try {
      const text = await Bun.file(this.filePath).text()
      return Option.getOrNull(Schema.decodeUnknownOption(LoopState)(JSON.parse(text)))
    } catch {
      return null
    }
  }
}

function transition(
  result: WorkResult,
  escalated: boolean,
  convergedNow: boolean,
  number: number,
  maxIterations: number,
): LoopStatus {
  if (result.ok) {
    if (convergedNow) return "done"
    if (number >= maxIterations) return "maxIterationsReached"
    return "running"
  }
  if (escalated) return "failed"
  if (number >= maxIterations) return "maxIterationsReached"
  return "iterating"
}

async function runWork(work: () => Promise<WorkResult>): Promise<WorkResult> {
  try {
    return await work()
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

function sanitizeError(message: string): string {
  return message
    .split("\n")
    .filter((line) => !line.includes("at "))
    .join("\n")
    .slice(0, 300)
}
