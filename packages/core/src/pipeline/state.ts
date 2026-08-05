export * as PipelineState from "./state"

import { randomUUID } from "node:crypto"
import { mkdir, rename, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

/**
 * Pipeline State Machine — enforced phase ordering with gates.
 *
 * Phases MUST execute in order. Skipping a phase is rejected.
 * Certain phases require gates to pass before advancing.
 */

export const PHASE_ORDER = [
  "discovery", "research", "planning", "architecture", "debate",
  "implementation", "review", "qa", "security",
  "self-critique", "question", "audit", "delivery",
] as const

export type Phase = (typeof PHASE_ORDER)[number]

export const PHASE_LABELS: Record<Phase, string> = {
  discovery: "Discovery", research: "Research", planning: "Planning",
  architecture: "Architecture", debate: "Debate", implementation: "Implementation",
  review: "Review", qa: "QA", security: "Security",
  "self-critique": "Self-Critique", question: "Question",
  audit: "Audit", delivery: "Delivery",
}

/** Gates required BEFORE a phase can start */
export const PHASE_GATES: Partial<Record<Phase, string[]>> = {
  review: ["lint", "types"],
  qa: ["build", "types", "tests"],
  security: ["build", "tests"],
  delivery: ["build", "lint", "types", "tests", "security"],
}

/** Agents recommended for each phase */
export const PHASE_AGENT: Record<Phase, string> = {
  discovery: "explore", research: "general", planning: "planner",
  architecture: "architect", debate: "general", implementation: "general",
  review: "code-reviewer", qa: "qa", security: "security",
  "self-critique": "auditor", question: "questionador",
  audit: "auditor", delivery: "release-manager",
}

export interface PipelineStatus {
  currentPhase: Phase | null
  completedPhases: Phase[]
  failedPhases: { phase: Phase; error: string }[]
  gatesPassed: Record<string, boolean>
  startedAt: number
  updatedAt: number
}

export function createInitialStatus(): PipelineStatus {
  return {
    currentPhase: null,
    completedPhases: [],
    failedPhases: [],
    gatesPassed: {},
    startedAt: Date.now(),
    updatedAt: Date.now(),
  }
}

export function statusFromJson(data: unknown): PipelineStatus | null {
  if (typeof data !== "object" || data === null) return null
  const d = data as Record<string, unknown>
  if (!Array.isArray(d.completedPhases) || !Array.isArray(d.failedPhases)) return null
  if (typeof d.gatesPassed !== "object" || d.gatesPassed === null) return null
  return d as unknown as PipelineStatus
}

export class PipelineStateMachine {
  private status: PipelineStatus = createInitialStatus()
  private listeners: Array<(status: PipelineStatus) => void> = []
  private persistPath: string | null = null

  constructor(persistPath?: string) {
    this.persistPath = persistPath ?? null
  }

  private autoSave(): void {
    if (this.persistPath) {
      this.save(this.persistPath).catch(console.error)
    }
  }

  async save(path: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true })
    const tmp = `${path}.${randomUUID()}.tmp`
    await writeFile(tmp, JSON.stringify(this.status, null, 2), { flag: "wx" })
    await rename(tmp, path)
  }

  static async load(path: string): Promise<PipelineStateMachine> {
    const file = Bun.file(path)
    if (!await file.exists()) {
      return new PipelineStateMachine(path)
    }
    const sm = new PipelineStateMachine(path)
    try {
      const status = statusFromJson(await file.json())
      if (status) sm.status = status
    } catch {
      // corrupt state file: keep fresh initial status, never throw
    }
    return sm
  }

  async reload(): Promise<PipelineStatus> {
    if (this.persistPath) {
      const file = Bun.file(this.persistPath)
      if (await file.exists()) {
        try {
          const status = statusFromJson(await file.json())
          if (status) this.status = status
        } catch {
          // corrupt state file: keep current in-memory status, never throw
        }
      }
    }
    this.notify()
    this.autoSave()
    return this.getStatus()
  }

  getStatus(): PipelineStatus {
    return { ...this.status }
  }

  subscribe(fn: (status: PipelineStatus) => void): () => void {
    this.listeners.push(fn)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn)
    }
  }

  private notify() {
    for (const fn of this.listeners) fn(this.getStatus())
  }

  /**
   * Start a phase. Validates order and gates.
   * Returns { ok, error? }.
   */
  startPhase(phase: Phase): { ok: boolean; error?: string } {
    const phaseIdx = PHASE_ORDER.indexOf(phase)
    if (phaseIdx === -1) return { ok: false, error: `Unknown phase: ${phase}` }

    if (this.status.completedPhases.includes(phase)) {
      return { ok: false, error: `Phase "${PHASE_LABELS[phase]}" already completed` }
    }

    const previousPhases = PHASE_ORDER.slice(0, phaseIdx)
    for (const prev of previousPhases) {
      if (!this.status.completedPhases.includes(prev)) {
        return {
          ok: false,
          error: `Cannot start "${PHASE_LABELS[phase]}". Previous phase "${PHASE_LABELS[prev]}" not completed. Order: ${PHASE_ORDER.map((p) => PHASE_LABELS[p]).join(" → ")}`,
        }
      }
    }

    const requiredGates = PHASE_GATES[phase]
    if (requiredGates) {
      const missing = requiredGates.filter((g) => !this.status.gatesPassed[g])
      if (missing.length > 0) {
        return {
          ok: false,
          error: `Cannot start "${PHASE_LABELS[phase]}". Required gates not passed: ${missing.join(", ")}. Run: /gate run-gates ${missing.join(" ")}`,
        }
      }
    }

    this.status.currentPhase = phase
    this.status.updatedAt = Date.now()
    this.notify()
    this.autoSave()
    return { ok: true }
  }

  /**
   * Complete a phase. Marks it as done and advances.
   */
  completePhase(phase: Phase): { ok: boolean; error?: string } {
    if (this.status.currentPhase !== phase) {
      return { ok: false, error: `Cannot complete "${PHASE_LABELS[phase]}". It is not the current phase.` }
    }
    if (this.status.completedPhases.includes(phase)) {
      return { ok: false, error: `Phase "${PHASE_LABELS[phase]}" already completed` }
    }
    this.status.completedPhases = [...this.status.completedPhases, phase]
    this.status.currentPhase = null
    this.status.updatedAt = Date.now()

    if (phase === "implementation") {
      this.status.gatesPassed["build"] = true
      this.status.gatesPassed["lint"] = true
      this.status.gatesPassed["types"] = true
    }
    if (phase === "qa") this.status.gatesPassed["tests"] = true
    if (phase === "security") this.status.gatesPassed["security"] = true

    this.notify()
    this.autoSave()
    return { ok: true }
  }

  /**
   * Fail a phase. Records the error.
   */
  failPhase(phase: Phase, error: string): { ok: boolean } {
    this.status.failedPhases = [...this.status.failedPhases, { phase, error }]
    this.status.currentPhase = null
    this.status.updatedAt = Date.now()
    this.notify()
    this.autoSave()
    return { ok: true }
  }

  /**
   * Pass a gate manually.
   */
  passGate(gate: string): void {
    this.status.gatesPassed[gate] = true
    this.status.updatedAt = Date.now()
    this.notify()
    this.autoSave()
  }

  /**
   * Check if all phases are complete.
   */
  isComplete(): boolean {
    return this.status.completedPhases.length === PHASE_ORDER.length
  }

  /**
   * Get next recommended phase.
   */
  getNextPhase(): Phase | null {
    for (const phase of PHASE_ORDER) {
      if (!this.status.completedPhases.includes(phase)) return phase
    }
    return null
  }

  /**
   * Reset the pipeline.
   */
  reset(): void {
    this.status = createInitialStatus()
    this.notify()
    this.autoSave()
  }

  /**
   * Export status as JSON string (for tool output).
   */
  toJSON(): string {
    const s = this.status
    const next = this.getNextPhase()
    return JSON.stringify(
      {
        currentPhase: s.currentPhase ? PHASE_LABELS[s.currentPhase] : null,
        completedPhases: s.completedPhases.map((p) => PHASE_LABELS[p]),
        failedPhases: s.failedPhases.map((f) => ({ phase: PHASE_LABELS[f.phase], error: f.error })),
        nextPhase: next ? PHASE_LABELS[next] : "ALL DONE",
        nextAgent: next ? PHASE_AGENT[next] : null,
        progress: `${s.completedPhases.length}/${PHASE_ORDER.length}`,
        gatesPassed: Object.entries(s.gatesPassed)
          .filter(([, v]) => v)
          .map(([k]) => k),
        isComplete: this.isComplete(),
      },
      null,
      2,
    )
  }
}
