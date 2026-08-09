export * as Backlog from "./backlog"

import { Option, Schema } from "effect"
import { createHash, randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname } from "node:path"

export function fingerprint(message: string): string {
  return createHash("md5").update(message).digest("hex").slice(0, 8)
}

const MAX_ITEMS = 5000

export const BacklogItemType = Schema.Union([
  Schema.Literal("bug"),
  Schema.Literal("feature"),
  Schema.Literal("tech-debt"),
  Schema.Literal("improvement"),
])
export type BacklogItemType = typeof BacklogItemType.Type

export const BacklogItemStatus = Schema.Union([
  Schema.Literal("open"),
  Schema.Literal("claimed"),
  Schema.Literal("done"),
  Schema.Literal("cancelled"),
])
export type BacklogItemStatus = typeof BacklogItemStatus.Type

export const BacklogItemSource = Schema.Union([
  Schema.Literal("manual"),
  Schema.Literal("observability"),
  Schema.Literal("audit"),
  Schema.Literal("self-critique"),
  Schema.Literal("loop"),
])
export type BacklogItemSource = typeof BacklogItemSource.Type

export const BacklogItem = Schema.Struct({
  id: Schema.String,
  title: Schema.NonEmptyString,
  description: Schema.optional(Schema.String),
  type: BacklogItemType,
  source: BacklogItemSource,
  status: BacklogItemStatus,
  priority: Schema.Number,
  reach: Schema.Number,
  impact: Schema.Number,
  confidence: Schema.Number,
  effort: Schema.Number,
  createdAt: Schema.Number,
  claimedBy: Schema.optional(Schema.String),
  claimedAt: Schema.optional(Schema.Number),
  claimedUntil: Schema.optional(Schema.Number),
  doneAt: Schema.optional(Schema.Number),
  fingerprint: Schema.optional(Schema.String),
})
export type BacklogItem = typeof BacklogItem.Type

export interface BacklogAddInput {
  title: string
  description?: string
  type?: BacklogItemType
  source?: BacklogItemSource
  reach?: number
  impact?: number
  confidence?: number
  effort?: number
  fingerprint?: string
}

export function riceScore(item: { reach: number; impact: number; confidence: number; effort: number; createdAt?: number }): number {
  const score = (item.reach * item.impact * item.confidence) / item.effort
  const base = Number.isFinite(score) ? score : 0
  if (!item.createdAt) return base
  const ageDays = (Date.now() - item.createdAt) / (24 * 60 * 60 * 1000)
  const decay = 1 + Math.log(1 + ageDays) * 0.1
  return base * decay
}

function clampFactor(value: unknown): number {
  return Number.isFinite(value) ? Math.max(1, Math.min(10, value as number)) : 1
}

export class BacklogEngine {
  private readonly filePath: string
  private readonly claimedTtlMs: number
  private items: BacklogItem[] = []
  private loaded = false

  constructor(filePath = `${homedir()}/.opencode/backlog.json`, claimedTtlMs = 30 * 60 * 1000) {
    this.filePath = filePath
    this.claimedTtlMs = claimedTtlMs
  }

  private ensureLoaded(): void {
    if (this.loaded) return
    this.loaded = true
    try {
      if (!existsSync(this.filePath)) return
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as unknown
      if (Array.isArray(parsed)) {
        this.items = parsed
          .flatMap((row) => {
            const item = Option.getOrNull(Schema.decodeUnknownOption(BacklogItem)(row))
            return item ? [item] : []
          })
          .slice(0, MAX_ITEMS)
      }
    } catch {
      this.renameCorrupt()
      this.items = []
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    const tmpPath = `${this.filePath}.${randomUUID()}.tmp`
    writeFileSync(tmpPath, JSON.stringify(this.items, null, 2), { flag: "wx" })
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
    return randomUUID()
  }

  private replace(id: string, updated: BacklogItem): void {
    this.items = this.items.map((item) => (item.id === id ? updated : item))
  }

  async list(status?: BacklogItemStatus | "all", filterFingerprint?: string): Promise<BacklogItem[]> {
    this.ensureLoaded()
    let items = status && status !== "all" ? this.items.filter((item) => item.status === status) : this.items
    if (filterFingerprint !== undefined) {
      items = items.filter((item) => item.fingerprint === filterFingerprint)
    }
    return [...items].sort((a, b) => {
      const scoreA = riceScore({ reach: a.reach, impact: a.impact, confidence: a.confidence, effort: a.effort, createdAt: a.createdAt })
      const scoreB = riceScore({ reach: b.reach, impact: b.impact, confidence: b.confidence, effort: b.effort, createdAt: b.createdAt })
      return scoreB - scoreA || a.createdAt - b.createdAt
    })
  }

  async add(input: BacklogAddInput): Promise<BacklogItem> {
    this.ensureLoaded()
    if (input.title.length === 0 || input.title.length > 300) {
      throw new Error(`Backlog item title must be 1-300 characters: got ${input.title.length}`)
    }
    if (input.description !== undefined && input.description.length > 500) {
      throw new Error(`Backlog item description must be at most 500 characters: got ${input.description.length}`)
    }
    const reach = clampFactor(input.reach ?? 1)
    const impact = clampFactor(input.impact ?? 1)
    const confidence = clampFactor(input.confidence ?? 1)
    const effort = clampFactor(input.effort ?? 1)
    const item: BacklogItem = {
      id: this.generateId(),
      title: input.title,
      description: input.description,
      type: input.type ?? "feature",
      source: input.source ?? "manual",
      status: "open",
      priority: riceScore({ reach, impact, confidence, effort, createdAt: Date.now() }),
      reach,
      impact,
      confidence,
      effort,
      createdAt: Date.now(),
      fingerprint: input.fingerprint,
    }
    this.items.push(item)
    this.persist()
    return item
  }

  async next(): Promise<BacklogItem | null> {
    this.ensureLoaded()
    const now = Date.now()
    let changed = false
    this.items = this.items.map((item) => {
      if (item.status === "claimed" && item.claimedUntil !== undefined && item.claimedUntil < now) {
        changed = true
        return { ...item, status: "open" as const, claimedBy: undefined, claimedAt: undefined, claimedUntil: undefined }
      }
      return item
    })
    if (changed) this.persist()
    const open = this.items.filter((item) => item.status === "open")
    if (open.length === 0) return null
    return open.sort((a, b) => {
      const scoreA = riceScore({ reach: a.reach, impact: a.impact, confidence: a.confidence, effort: a.effort, createdAt: a.createdAt })
      const scoreB = riceScore({ reach: b.reach, impact: b.impact, confidence: b.confidence, effort: b.effort, createdAt: b.createdAt })
      return scoreB - scoreA || a.createdAt - b.createdAt
    })[0]
  }

  async claim(id: string, agent: string): Promise<BacklogItem> {
    this.ensureLoaded()
    const item = this.items.find((candidate) => candidate.id === id)
    if (!item) throw new Error(`Backlog item not found: ${id}`)
    if (item.status !== "open") throw new Error(`Backlog item is not open: ${item.status}`)
    const updated: BacklogItem = {
      ...item,
      status: "claimed",
      claimedBy: agent,
      claimedAt: Date.now(),
      claimedUntil: Date.now() + this.claimedTtlMs,
    }
    this.replace(id, updated)
    this.persist()
    return updated
  }

  async complete(id: string): Promise<BacklogItem> {
    this.ensureLoaded()
    const item = this.items.find((candidate) => candidate.id === id)
    if (!item) throw new Error(`Backlog item not found: ${id}`)
    if (item.status !== "claimed") throw new Error(`Backlog item is not claimed: ${item.status}`)
    const updated: BacklogItem = { ...item, status: "done", doneAt: Date.now() }
    this.replace(id, updated)
    this.persist()
    return updated
  }

  async cancel(id: string): Promise<BacklogItem> {
    this.ensureLoaded()
    const item = this.items.find((candidate) => candidate.id === id)
    if (!item) throw new Error(`Backlog item not found: ${id}`)
    const updated: BacklogItem = { ...item, status: "cancelled" }
    this.replace(id, updated)
    this.persist()
    return updated
  }

  async refreshClaim(id: string): Promise<BacklogItem> {
    this.ensureLoaded()
    const item = this.items.find((candidate) => candidate.id === id)
    if (!item) throw new Error(`Backlog item not found: ${id}`)
    if (item.status !== "claimed") throw new Error(`Backlog item is not claimed: ${item.status}`)
    const updated: BacklogItem = { ...item, claimedUntil: Date.now() + this.claimedTtlMs }
    this.replace(id, updated)
    this.persist()
    return updated
  }

  async releaseClaim(id: string): Promise<BacklogItem> {
    this.ensureLoaded()
    const item = this.items.find((candidate) => candidate.id === id)
    if (!item) throw new Error(`Backlog item not found: ${id}`)
    if (item.status !== "claimed") throw new Error(`Backlog item is not claimed: ${item.status}`)
    const updated: BacklogItem = {
      ...item,
      status: "open",
      claimedBy: undefined,
      claimedAt: undefined,
      claimedUntil: undefined,
    }
    this.replace(id, updated)
    this.persist()
    return updated
  }

  async prioritize(
    id: string,
    input: { reach: number; impact: number; confidence: number; effort: number },
  ): Promise<BacklogItem> {
    this.ensureLoaded()
    const item = this.items.find((candidate) => candidate.id === id)
    if (!item) throw new Error(`Backlog item not found: ${id}`)
    const clamped = {
      reach: clampFactor(input.reach),
      impact: clampFactor(input.impact),
      confidence: clampFactor(input.confidence),
      effort: clampFactor(input.effort),
    }
    const updated: BacklogItem = { ...item, ...clamped, priority: riceScore({ ...clamped, createdAt: item.createdAt }) }
    this.replace(id, updated)
    this.persist()
    return updated
  }

  async counts(): Promise<{ open: number; claimed: number; done: number; cancelled: number }> {
    this.ensureLoaded()
    const counts = { open: 0, claimed: 0, done: 0, cancelled: 0 }
    for (const item of this.items) counts[item.status]++
    return counts
  }
}
