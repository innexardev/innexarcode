import { randomUUID } from "node:crypto"
import { mkdir, rename, rm, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname } from "node:path"
import { Option, Schema } from "effect"

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
}

export function converged(config: LoopConfig, results: Record<string, unknown>): boolean {
  const criteria = config.convergenceCriteria
  if (criteria.length === 0) return true
  return criteria.every((c) => Object.hasOwn(results, c) && Boolean(results[c]))
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
  }
}

export class LoopEngine {
  readonly config: LoopConfig

  constructor(
    private readonly filePath: string = `${homedir()}/.opencode/loop-state.json`,
    config: Partial<LoopConfig> = {},
  ) {
    this.config = normalizeConfig(config)
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

    const number = (state.currentIteration ?? 0) + 1
    const escalated = !result.ok && state.failureCount + 1 >= 2
    const error = result.ok ? undefined : sanitizeError(result.error ?? "Unknown error")

    const iteration: LoopIteration = {
      number,
      phase,
      status: escalated ? "escalated" : result.ok ? "success" : "failed",
      adjustments: result.adjustments ?? {},
      durationMs: timestamp - startedAt,
      timestamp,
      result: error,
    }
    const status = transition(
      result,
      escalated,
      converged(this.config, iteration.adjustments),
      number,
      state.maxIterations,
    )
    const next: LoopState = {
      ...state,
      status,
      iterations: [...state.iterations, iteration],
      currentIteration: number,
      finishedAt: status === "running" || status === "iterating" ? null : timestamp,
      failureCount: result.ok ? 0 : state.failureCount + 1,
      lastError: result.ok ? state.lastError : error,
    }

    await this.persist(next)
    return next
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
