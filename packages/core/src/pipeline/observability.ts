export * as Observability from "./observability"

import { Option, Schema } from "effect"
import { createHash, randomUUID } from "node:crypto"
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import type { BacklogEngine } from "./backlog"

export const EventLevel = Schema.Union([
  Schema.Literal("info"),
  Schema.Literal("warn"),
  Schema.Literal("error"),
])
export type EventLevel = typeof EventLevel.Type

export const ProdEvent = Schema.Struct({
  id: Schema.String,
  source: Schema.String,
  level: EventLevel,
  message: Schema.NonEmptyString,
  context: Schema.Record(Schema.String, Schema.Unknown),
  timestamp: Schema.Number,
  fingerprint: Schema.NullOr(Schema.String),
  traceId: Schema.NullOr(Schema.String),
  spanId: Schema.NullOr(Schema.String),
})
export type ProdEvent = typeof ProdEvent.Type

export interface ObservabilityConfig {
  maxEvents: number
  dedupeWindowMs: number
  maxAuditLines: number
}

export interface RecordEventInput {
  source: string
  level: EventLevel
  message: string
  context?: Record<string, unknown>
  traceId?: string
  spanId?: string
}

export class ObservabilityEngine {
  private readonly filePath: string
  private readonly auditPath: string
  private readonly config: ObservabilityConfig
  private readonly backlog: BacklogEngine | undefined
  private events: ProdEvent[] = []
  private loaded = false
  private seq = 0

  constructor(
    filePath = `${homedir()}/.opencode/observability.json`,
    config?: Partial<ObservabilityConfig>,
    backlog?: BacklogEngine,
  ) {
    this.filePath = filePath
    this.auditPath = join(dirname(filePath), "observability-audit.jsonl")
    this.config = {
      maxEvents: config?.maxEvents ?? 500,
      dedupeWindowMs: config?.dedupeWindowMs ?? 3600_000,
      maxAuditLines: config?.maxAuditLines ?? 10000,
    }
    this.backlog = backlog
  }

  static fingerprint(source: string, level: string, message: string): string {
    const stackLine = extractStack(message)
    const payload = stackLine ?? message
    return createHash("md5").update(`${source}:${level}:${payload}`).digest("hex").slice(0, 12)
  }

  private ensureLoaded(): void {
    if (this.loaded) return
    this.loaded = true
    try {
      if (!existsSync(this.filePath)) return
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as unknown
      if (Array.isArray(parsed)) {
        this.events = parsed
          .flatMap((row) => {
            const event = Option.getOrNull(Schema.decodeUnknownOption(ProdEvent)(row))
            return event ? [event] : []
          })
          .slice(-this.config.maxEvents)
      }
    } catch {
      this.renameCorrupt()
      this.events = []
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    const tmpPath = `${this.filePath}.${randomUUID()}.tmp`
    writeFileSync(tmpPath, JSON.stringify(this.events, null, 2), { flag: "wx" })
    renameSync(tmpPath, this.filePath)
  }

  private renameCorrupt(): void {
    try {
      renameSync(this.filePath, `${this.filePath}.corrupt-${Date.now()}`)
    } catch {
      // best-effort: never crash on a corrupt state file
    }
  }

  private generateId(): string {
    return `event-${Date.now()}-${++this.seq}`
  }

  async record(input: RecordEventInput): Promise<ProdEvent | null> {
    this.ensureLoaded()
    if (input.message.length > 500) {
      throw new Error(`message too long: got ${input.message.length} chars (max 500)`)
    }
    if (input.source.length > 100) {
      throw new Error(`source too long: got ${input.source.length} chars (max 100)`)
    }
    const now = Date.now()
    const fp = ObservabilityEngine.fingerprint(input.source, input.level, input.message)

    const duplicateByFingerprint = this.events.find(
      (event) =>
        event.fingerprint === fp &&
        now - event.timestamp <= this.config.dedupeWindowMs,
    )
    if (duplicateByFingerprint) return null

    const duplicateByWindow = this.events.find(
      (event) =>
        event.source === input.source &&
        event.level === input.level &&
        event.message === input.message &&
        now - event.timestamp <= this.config.dedupeWindowMs,
    )
    if (duplicateByWindow) return null

    const event: ProdEvent = {
      id: this.generateId(),
      source: input.source,
      level: input.level,
      message: input.message,
      context: input.context ?? {},
      timestamp: now,
      fingerprint: fp,
      traceId: input.traceId ?? null,
      spanId: input.spanId ?? null,
    }
    this.events.push(event)
    if (this.events.length > this.config.maxEvents) {
      this.events = this.events.slice(this.events.length - this.config.maxEvents)
    }
    this.persist()
    this.appendAudit(event)

    if (input.level === "error") {
      try {
        await this.maybeCreateBacklogBug(input)
      } catch {
        // backlog integration must never make record() reject
      }
    }
    return event
  }

  async list(level?: EventLevel, limit = 50): Promise<ProdEvent[]> {
    this.ensureLoaded()
    const filtered = level ? this.events.filter((event) => event.level === level) : this.events
    return [...filtered].sort((a, b) => b.timestamp - a.timestamp).slice(0, limit)
  }

  async counts(): Promise<{ info: number; warn: number; error: number; total: number }> {
    this.ensureLoaded()
    const counts = { info: 0, warn: 0, error: 0, total: this.events.length }
    for (const event of this.events) counts[event.level]++
    return counts
  }

  async listByFingerprint(fingerprint: string, limit = 50): Promise<ProdEvent[]> {
    this.ensureLoaded()
    const filtered = this.events.filter((event) => event.fingerprint === fingerprint)
    return [...filtered].sort((a, b) => b.timestamp - a.timestamp).slice(0, limit)
  }

  async streamAudit(fromTimestamp?: number, limit = 100): Promise<ProdEvent[]> {
    if (!existsSync(this.auditPath)) return []
    const lines = readFileSync(this.auditPath, "utf8").split("\n").filter(Boolean)
    const events: ProdEvent[] = []
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as unknown
        const event = Option.getOrNull(Schema.decodeUnknownOption(ProdEvent)(parsed))
        if (event && (!fromTimestamp || event.timestamp >= fromTimestamp)) {
          events.push(event)
        }
      } catch {
        // skip corrupt lines
      }
    }
    const sorted = [...events].sort((a, b) => b.timestamp - a.timestamp)
    return sorted.slice(0, limit)
  }

  private appendAudit(event: ProdEvent): void {
    mkdirSync(dirname(this.auditPath), { recursive: true })
    appendFileSync(this.auditPath, JSON.stringify(event) + "\n")
    this.rotateAudit()
  }

  private rotateAudit(): void {
    if (!existsSync(this.auditPath)) return
    const lines = readFileSync(this.auditPath, "utf8").split("\n").filter(Boolean)
    if (lines.length <= this.config.maxAuditLines) return
    const kept = lines.slice(lines.length - this.config.maxAuditLines)
    writeFileSync(this.auditPath, kept.join("\n") + "\n")
  }

  private async maybeCreateBacklogBug(input: RecordEventInput): Promise<void> {
    if (!this.backlog) return
    const title = `[${input.source}] ${input.message}`.slice(0, 300)
    const existing = await this.backlog.list()
    const hasSimilar = existing.some(
      (item) => (item.status === "open" || item.status === "claimed") && item.title.startsWith(title),
    )
    if (hasSimilar) return
    await this.backlog.add({ title, type: "bug", source: "observability" })
  }
}

function extractStack(message: string): string | null {
  const match = message.match(/at .+/gm)
  return match ? match[0] : null
}
