export * as Observability from "./observability"

import { Option, Schema } from "effect"
import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname } from "node:path"
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
})
export type ProdEvent = typeof ProdEvent.Type

export interface ObservabilityConfig {
  maxEvents: number
  dedupeWindowMs: number
}

export interface RecordEventInput {
  source: string
  level: EventLevel
  message: string
  context?: Record<string, unknown>
}

export class ObservabilityEngine {
  private readonly filePath: string
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
    this.config = {
      maxEvents: config?.maxEvents ?? 500,
      dedupeWindowMs: config?.dedupeWindowMs ?? 3600_000,
    }
    this.backlog = backlog
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
    const duplicate = this.events.find(
      (event) =>
        event.source === input.source &&
        event.level === input.level &&
        event.message === input.message &&
        now - event.timestamp <= this.config.dedupeWindowMs,
    )
    if (duplicate) return null

    const event: ProdEvent = {
      id: this.generateId(),
      source: input.source,
      level: input.level,
      message: input.message,
      context: input.context ?? {},
      timestamp: now,
    }
    this.events.push(event)
    if (this.events.length > this.config.maxEvents) {
      this.events = this.events.slice(this.events.length - this.config.maxEvents)
    }
    this.persist()

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
