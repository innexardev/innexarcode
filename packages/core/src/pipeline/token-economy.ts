export * as TokenEconomy from "./token-economy"

import { randomUUID } from "node:crypto"
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, basename } from "node:path"
import { Artifact } from "../artifact"
import { cleanupOrphanedTmp } from "./persist"

/**
 * Token Economy — orçamento de tokens por nível (session/agent/subagent).
 *
 * Camadas de contexto estável/semi-estável/volátil são coletadas em ordem
 * de estabilidade decrescente; contexto volátil nunca precede estável.
 * O engine persiste métricas por sessão com escrita atômica, igual ao
 * ObservabilityEngine, e nunca lança erro por falha de persistência.
 */

export const DEFAULT_BUDGETS = {
  session: 1_000_000,
  agent: 300_000,
  subagent: 100_000,
}

export const DEFAULT_THRESHOLDS = {
  compact_at: 0.8,
  finalize_at: 0.9,
  hard_stop: 1.0,
}

export const DEFAULT_COST = {
  inputPerM: 3,
  outputPerM: 15,
  cachedDiscount: 0.1,
}

export interface BudgetConfig {
  session: number
  agent: number
  subagent: number
  compact_at: number
  finalize_at: number
  hard_stop: number
}

export interface CostConfig {
  inputPerM: number
  outputPerM: number
  cachedDiscount: number
}

export const BUDGET_LEVELS = ["session", "agent", "subagent"] as const
export type BudgetLevel = (typeof BUDGET_LEVELS)[number]

export type BudgetStatus = "ok" | "compact" | "finalize" | "stop"

export function estimateTokens(text: string, type?: Artifact.ArtifactType, language?: Artifact.ArtifactLanguage): number {
  return Artifact.estimateTokens(text, type, language)
}

const BUDGET_ENV_KEYS: Record<keyof BudgetConfig, string> = {
  session: "TOKEN_ECONOMY_BUDGET_SESSION",
  agent: "TOKEN_ECONOMY_BUDGET_AGENT",
  subagent: "TOKEN_ECONOMY_BUDGET_SUBAGENT",
  compact_at: "TOKEN_ECONOMY_BUDGET_COMPACT_AT",
  finalize_at: "TOKEN_ECONOMY_BUDGET_FINALIZE_AT",
  hard_stop: "TOKEN_ECONOMY_BUDGET_HARD_STOP",
}

const COST_ENV_KEYS: Record<keyof CostConfig, string> = {
  inputPerM: "TOKEN_ECONOMY_COST_INPUT_PER_M",
  outputPerM: "TOKEN_ECONOMY_COST_OUTPUT_PER_M",
  cachedDiscount: "TOKEN_ECONOMY_COST_CACHED_DISCOUNT",
}

export function loadBudgetConfig(env: Record<string, string | undefined> = process.env): BudgetConfig {
  const budgets = {
    session: parsePositiveInt(env[BUDGET_ENV_KEYS.session], DEFAULT_BUDGETS.session, MAX_BUDGET),
    agent: parsePositiveInt(env[BUDGET_ENV_KEYS.agent], DEFAULT_BUDGETS.agent, MAX_BUDGET),
    subagent: parsePositiveInt(env[BUDGET_ENV_KEYS.subagent], DEFAULT_BUDGETS.subagent, MAX_BUDGET),
    compact_at: parseThreshold(env[BUDGET_ENV_KEYS.compact_at], DEFAULT_THRESHOLDS.compact_at),
    finalize_at: parseThreshold(env[BUDGET_ENV_KEYS.finalize_at], DEFAULT_THRESHOLDS.finalize_at),
    hard_stop: parseThreshold(env[BUDGET_ENV_KEYS.hard_stop], DEFAULT_THRESHOLDS.hard_stop),
  }
  if (!(budgets.compact_at > 0 && budgets.compact_at <= budgets.finalize_at && budgets.finalize_at <= budgets.hard_stop && budgets.hard_stop <= 1)) {
    budgets.compact_at = DEFAULT_THRESHOLDS.compact_at
    budgets.finalize_at = DEFAULT_THRESHOLDS.finalize_at
    budgets.hard_stop = DEFAULT_THRESHOLDS.hard_stop
  }
  return budgets
}

export function loadCostConfig(env: Record<string, string | undefined> = process.env): CostConfig {
  return {
    inputPerM: parseNonNegative(env[COST_ENV_KEYS.inputPerM], DEFAULT_COST.inputPerM, MAX_COST_PER_M),
    outputPerM: parseNonNegative(env[COST_ENV_KEYS.outputPerM], DEFAULT_COST.outputPerM, MAX_COST_PER_M),
    cachedDiscount: parseThreshold(env[COST_ENV_KEYS.cachedDiscount], DEFAULT_COST.cachedDiscount),
  }
}

/** Sanity caps: absurd env values fall back to defaults instead of silently disabling or overflowing the metrics. */
const MAX_BUDGET = 1e12
const MAX_COST_PER_M = 1e6

function parsePositiveInt(raw: string | undefined, fallback: number, max = Infinity): number {
  const value = parseInt(raw ?? "", 10)
  return Number.isFinite(value) && value > 0 && value <= max ? value : fallback
}

function parseThreshold(raw: string | undefined, fallback: number): number {
  const value = parseFloat(raw ?? "")
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback
}

function parseNonNegative(raw: string | undefined, fallback: number, max = Infinity): number {
  const value = parseFloat(raw ?? "")
  return Number.isFinite(value) && value >= 0 && value <= max ? value : fallback
}

export function budgetLimit(level: BudgetLevel, config: BudgetConfig = loadBudgetConfig()): number {
  return config[level]
}

export interface BudgetCheck {
  status: BudgetStatus
  ratio: number
  limit: number
  recommendedAction: string
}

export function checkBudget(level: BudgetLevel, currentTokens: number, config: BudgetConfig = loadBudgetConfig()): BudgetCheck {
  const limit = budgetLimit(level, config)
  const ratio = !Number.isFinite(currentTokens) ? 1 : limit === 0 ? 0 : currentTokens / limit
  if (ratio >= config.hard_stop) {
    return { status: "stop", ratio, limit, recommendedAction: "Parar agora — hard stop atingido" }
  }
  if (ratio >= config.finalize_at) {
    return { status: "finalize", ratio, limit, recommendedAction: "Finalizar e entregar — budget quase esgotado" }
  }
  if (ratio >= config.compact_at) {
    return { status: "compact", ratio, limit, recommendedAction: "Compactar contexto estruturado antes de continuar" }
  }
  return { status: "ok", ratio, limit, recommendedAction: "Prosseguir — dentro do orçamento" }
}

export interface ContextLayer {
  name: string
  tier: 0 | 1 | 2
  content: string
}

export class CacheOrderViolation extends Error {}

export interface ContextCollector {
  add(layer: ContextLayer): void
  build(): string
  layers(): ContextLayer[]
}

/**
 * Library surface (createContextCollector / validateStable / assertStable /
 * createStructuredCompaction / parseStructuredCompaction) is exercised by tests
 * and by an observation-only hook in the real prompt build path:
 * packages/opencode/src/session/prompt.ts (observeContextLayers) runs the
 * collector over the assembled system layers (instructions L0, skills L1,
 * environment/mcp L2) when OPENCODE_CONTEXT_COLLECTOR=true, without mutating the
 * prompt output. It is kept out of the hot path by default: validating or
 * restructuring live prompts would change production behavior (token counts,
 * cache keys), and the structured compaction format is not yet wired into the
 * session compaction flow (packages/opencode/src/session/compaction.ts).
 * Future integration: feed validateStable results into the cache-eviction
 * decision and drive createStructuredCompaction from the real compaction prompt.
 */
/**
 * Returns false (volatile) only when the content embeds an actual time/date
 * VALUE — an ISO literal, a clock time, or a temporal word ("timestamp",
 * "current time", "hoje", "agora", "data atual", "última atualização")
 * immediately followed by such a value. Mentions of those words in
 * specification context ("Phase transitions logged with timestamp") are stable:
 * they carry no value and do not change between requests. Bare date-only
 * literals are also stable, since dates often appear as version identifiers
 * (e.g. "schema 2026-08-11").
 */
export function validateStable(content: string): boolean {
  if (/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(content)) return false
  if (/(^|\s)(às|at)\s+\d{1,2}:\d{2}\b/i.test(content)) return false
  if (/timestamp\s*[:=]\s*\d{4}-\d{2}-\d{2}/i.test(content)) return false
  if (/timestamp\s*[:=]\s*\d{1,2}:\d{2}/i.test(content)) return false
  if (/current time\s+(is\s+)?\d{1,2}:\d{2}/i.test(content)) return false
  if (/now is\s+\d{1,2}:\d{2}/i.test(content)) return false
  if (timeValueAfter(content, "hoje", false)) return false
  if (timeValueAfter(content, "agora", false)) return false
  if (timeValueAfter(content, "data atual", true)) return false
  if (timeValueAfter(content, "última atualiza", true)) return false
  if (timeValueAfter(content, "ultima atualiza", true)) return false
  return true
}

function timeValueAfter(content: string, marker: string, allowDate: boolean): boolean {
  const value = allowDate ? "\\d{1,2}:\\d{2}|\\d{4}-\\d{2}-\\d{2}" : "\\d{1,2}:\\d{2}"
  return new RegExp(`${marker}.{0,30}(${value})`, "i").test(content)
}

export function assertStable(layer: ContextLayer): void {
  if (layer.tier === 0 && !validateStable(layer.content)) {
    throw new CacheOrderViolation(`layer "${layer.name}" is tier 0 but contains volatile content`)
  }
}

export function createContextCollector(): ContextCollector {
  const collected: ContextLayer[] = []
  let maxTier = -1
  return {
    add(layer) {
      if (!Number.isInteger(layer.tier) || layer.tier < 0 || layer.tier > 2) {
        throw new CacheOrderViolation(`layer "${layer.name}" has invalid tier ${String(layer.tier)}`)
      }
      if (layer.tier < maxTier) {
        throw new CacheOrderViolation("volatile content cannot precede stable content")
      }
      assertStable(layer)
      maxTier = Math.max(maxTier, layer.tier)
      collected.push(layer)
    },
    build() {
      return collected
        .map((layer) => `## L${layer.tier} ${layer.name}\n\n${layer.content}`)
        .join("\n\n---\n\n")
    },
    layers() {
      return [...collected]
    },
  }
}

export interface StructuredCompactionState {
  goal: string
  decisions: string[]
  files_changed: string[]
  pending_tasks: string[]
  blockers: string[]
  next_step: string
  completed?: string[]
}

export function createStructuredCompaction(state: StructuredCompactionState): string {
  const lines: string[] = []
  lines.push("## Objective", "", escapeHeaderLines(state.goal), "")
  lines.push("## Important Details")
  for (const decision of state.decisions) lines.push(...bulletLines(decision))
  lines.push("", "## Work State", "", "### Completed")
  for (const item of state.completed ?? []) lines.push(...bulletLines(item))
  lines.push("", "### Active")
  for (const task of state.pending_tasks) lines.push(...bulletLines(task))
  lines.push("", "### Blocked")
  for (const blocker of state.blockers) lines.push(...bulletLines(blocker))
  lines.push("", "## Next Move", `1. ${indentContinuation(state.next_step)}`, "", "## Relevant Files")
  for (const file of state.files_changed) lines.push(...bulletLines(file))
  return lines.join("\n")
}

function bulletLines(item: string): string[] {
  const [first, ...rest] = item.split("\n")
  return [`- ${first}`, ...rest.map((line) => `  ${line}`)]
}

function indentContinuation(item: string): string {
  return item.split("\n").join("\n  ")
}

/** Escapes markdown header-like lines in free-text fields so they cannot split the artifact into fake sections. */
function escapeHeaderLines(text: string): string {
  return text
    .split("\n")
    .map((line) => (/^#{1,6}\s/.test(line) ? `  ${line}` : line))
    .join("\n")
}

export function parseStructuredCompaction(text: string): StructuredCompactionState {
  const sections = splitSections(text)
  const work = splitSections(sections.get("Work State") ?? "", /^###\s+(.*)$/)
  const completed = bullets(work.get("Completed") ?? "")
  const state: StructuredCompactionState = {
    goal: (sections.get("Objective") ?? "").trim(),
    decisions: bullets(sections.get("Important Details") ?? ""),
    files_changed: bullets(sections.get("Relevant Files") ?? ""),
    pending_tasks: bullets(work.get("Active") ?? ""),
    blockers: bullets(work.get("Blocked") ?? ""),
    next_step: numbered(sections.get("Next Move") ?? ""),
  }
  if (completed.length > 0) state.completed = completed
  return state
}

function splitSections(text: string, header = /^##(?!#)\s+(.*)$/): Map<string, string> {
  const sections = new Map<string, string>()
  const buffers = new Map<string, string[]>()
  let current: string | undefined
  for (const line of text.split("\n")) {
    const match = line.match(header)
    if (match) {
      current = match[1].trim()
      buffers.set(current, [])
      sections.set(current, "")
    } else if (current) {
      buffers.get(current)!.push(line)
    }
  }
  for (const [name, lines] of buffers) {
    sections.set(name, lines.join("\n") + "\n")
  }
  return sections
}

function bullets(content: string): string[] {
  const items: string[] = []
  for (const line of content.split("\n")) {
    const trimmed = line.trim()
    if (trimmed.startsWith("- ")) {
      items.push(trimmed.slice(2).trim())
    } else if (items.length > 0 && /^\s{2,}\S/.test(line)) {
      // indented continuation line joins the previous bullet
      items[items.length - 1] += "\n" + trimmed
    }
  }
  return items
}

function numbered(content: string): string {
  const parts: string[] = []
  let started = false
  for (const line of content.split("\n")) {
    const trimmed = line.trim()
    if (/^\d+\.\s+/.test(trimmed)) {
      started = true
      parts.push(trimmed.replace(/^\d+\.\s+/, ""))
    } else if (started && /^\s{2,}\S/.test(line)) {
      parts.push(trimmed)
    }
  }
  if (parts.length === 0) return content.trim()
  return parts.join("\n")
}

export interface TokenMetrics {
  requests: number
  input_tokens: number
  output_tokens: number
  cached_read: number
  estimated_cost: number
  budget_breaches: number
  compactions: number
  cache_hit_rate: number
  /** Internal: true while the current budget crossing is already counted. Optional so pre-existing state files (without the field) load fine and default to "not counted". */
  breach_counted?: boolean
}

export function cumulativeTokens(metrics: TokenMetrics): number {
  return metrics.input_tokens + metrics.output_tokens + metrics.cached_read
}

/**
 * Tokens that actually cost money: fresh input + output. Cached reads are
 * billed at a discount (cachedDiscount) and are not waste, so they don't
 * count toward the budget brake.
 */
export function budgetTokens(metrics: TokenMetrics): number {
  return metrics.input_tokens + metrics.output_tokens
}

const METRICS_FIELDS = [
  "requests", "input_tokens", "output_tokens", "cached_read",
  "estimated_cost", "budget_breaches", "compactions", "cache_hit_rate",
] as const

const STATE_VERSION = 1

interface TokenEconomyState {
  version: number
  sessions: Record<string, TokenMetrics>
  total: TokenMetrics
}

export class TokenEconomyEngine {
  private readonly filePath: string
  private state: TokenEconomyState = emptyState()
  private pending: TokenDelta[] = []
  private loaded = false

  constructor(filePath = `${homedir()}/.opencode/token-economy.json`) {
    this.filePath = filePath
  }

  private ensureLoaded(): void {
    if (this.loaded) return
    this.loaded = true
    cleanupOrphanedTmp(dirname(this.filePath), basename(this.filePath))
    const base = this.loadFromDisk()
    if (base) {
      this.state = base
      return
    }
    if (!existsSync(this.filePath)) return
    try {
      if (!lstatSync(this.filePath).isFile()) return // symlink, dir, device, FIFO: never touch
    } catch {
      return // path vanished; nothing to quarantine
    }
    this.renameCorrupt()
  }

  /**
   * Fresh snapshot of the on-disk state; null when missing, unreadable or invalid.
   * Only regular files are ever read — symlinks, directories, devices and FIFOs
   * are rejected up front (a symlink to /dev/zero would hang the process forever).
   */
  private loadFromDisk(): TokenEconomyState | null {
    try {
      if (!existsSync(this.filePath)) return null
      if (!lstatSync(this.filePath).isFile()) return null
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as unknown
      return isTokenEconomyState(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
      if (!this.acquireLock()) {
        this.warnPersist("lock not acquired")
        return // stale lock: skip this write, deltas survive until next persist
      }
      try {
        this.replayPending()
        this.writeState()
      } finally {
        this.releaseLock()
      }
    } catch (error) {
      this.warnPersist(error)
    }
  }

  private warnPersist(error?: unknown): void {
    const detail = error instanceof Error ? `: ${error.message}` : ""
    console.warn(`[token-economy] persistence failed${detail} — metrics may be stale`)
  }

  /**
   * Reapply unpersisted deltas on top of a fresh disk snapshot.
   * Correct multi-writer semantics: no lost updates (other writers' records are
   * re-read under the lock) and no double counting (own deltas replay exactly once).
   */
  private replayPending(): void {
    if (this.pending.length === 0) return
    const base = this.loadFromDisk() ?? emptyState()
    for (const delta of this.pending) applyDelta(base, delta)
    this.state = base
    this.pending = []
  }

  /** Cross-process lock (lockfile + backoff) so concurrent engines cannot interleave read-merge-write. */
  private acquireLock(): boolean {
    const lockPath = `${this.filePath}.lock`
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        const fd = openSync(lockPath, "wx")
        closeSync(fd)
        return true
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code !== "EEXIST") return false
        // steal locks older than 5s (crashed process)
        try {
          if (Date.now() - statSync(lockPath).mtimeMs > 5000) unlinkSync(lockPath)
        } catch {
          // lock vanished — retry immediately
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
      }
    }
    return false
  }

  private releaseLock(): void {
    try {
      unlinkSync(`${this.filePath}.lock`)
    } catch {
      // stale lock: best-effort cleanup
    }
  }

  private writeState(): void {
    const tmpPath = `${this.filePath}.${randomUUID()}.tmp`
    writeFileSync(tmpPath, JSON.stringify(this.state, null, 2), { flag: "wx", mode: 0o600 })
    renameSync(tmpPath, this.filePath)
  }

  private renameCorrupt(): void {
    try {
      renameSync(this.filePath, `${this.filePath}.corrupt-${Date.now()}`)
    } catch {
      // best-effort: never crash on a corrupt state file
    }
  }

  record(
    level: BudgetLevel,
    inputTokens: number,
    outputTokens: number,
    cachedRead: number,
    sessionKey = "default",
    config?: { cost?: CostConfig; budgets?: BudgetConfig },
  ): void {
    // sanitize: NaN/±Infinity would corrupt the whole metrics file; negatives are clamped
    const input = safeCount(inputTokens)
    const output = safeCount(outputTokens)
    const cached = safeCount(cachedRead)
    const key = sanitizeSessionKey(sessionKey)
    this.ensureLoaded()

    const cost = config?.cost ?? loadCostConfig()
    const budgets = config?.budgets ?? loadBudgetConfig()
    // clamp overflow: absurd cost × tokens must never produce Infinity in the metrics file
    const added = safeCount(
      Math.max(0, input - cached) * cost.inputPerM / 1e6
        + cached * cost.cachedDiscount * cost.inputPerM / 1e6
        + output * cost.outputPerM / 1e6,
    )

    const delta: TokenDelta = { sessionKey: key, input, output, cached, added, breach: budgetTokens(this.session(key)) + input + output >= budgetLimit(level, budgets), compactions: 0 }
    applyDelta(this.state, delta)
    this.pending.push(delta)
    this.persist()
  }

  recordCompaction(sessionKey = "default"): void {
    this.ensureLoaded()
    const key = sanitizeSessionKey(sessionKey)
    const delta: TokenDelta = { sessionKey: key, input: 0, output: 0, cached: 0, added: 0, breach: false, compactions: 1 }
    applyDelta(this.state, delta)
    this.pending.push(delta)
    this.persist()
  }

  status(): TokenEconomyState {
    this.ensureLoaded()
    // null-prototype clone: `__proto__` (allowed by sanitizeSessionKey) must stay an own
    // property on the returned view, never a prototype mutation of the clone itself.
    const sessions: Record<string, TokenMetrics> = Object.create(null)
    for (const [key, metrics] of Object.entries(this.state.sessions)) {
      sessions[key] = { ...metrics }
    }
    return { version: this.state.version, sessions, total: { ...this.state.total } }
  }

  private session(key: string): TokenMetrics {
    let metrics = this.state.sessions[key]
    if (!metrics) {
      const keys = Object.keys(this.state.sessions)
      if (keys.length >= MAX_SESSION_KEYS) {
        delete this.state.sessions[keys[0]] // LRU-ish: drop oldest key to bound file growth
      }
      metrics = emptyMetrics()
      this.state.sessions[key] = metrics
    }
    return metrics
  }
}

/** Bounded, prototype-safe session keys. Never allow untrusted keys to reach object prototypes. */
const MAX_SESSION_KEYS = 500
const MAX_SESSION_KEY_LENGTH = 128

function sanitizeSessionKey(key: unknown): string {
  if (typeof key !== "string") return "default"
  const clean = key.replace(/[^A-Za-z0-9_.:\/-]/g, "").slice(0, MAX_SESSION_KEY_LENGTH)
  return clean.length > 0 ? clean : "default"
}

interface TokenDelta {
  sessionKey: string
  input: number
  output: number
  cached: number
  added: number
  breach: boolean
  compactions: number
}

function applyDelta(state: TokenEconomyState, delta: TokenDelta): void {
  const session = state.sessions[delta.sessionKey] ?? (state.sessions[delta.sessionKey] = emptyMetrics())
  if (delta.compactions === 0) session.requests++
  session.input_tokens += delta.input
  session.output_tokens += delta.output
  session.cached_read += delta.cached
  session.estimated_cost += delta.added
  session.compactions += delta.compactions
  countBreach(session, delta)
  session.cache_hit_rate = cacheHitRate(session)

  if (delta.compactions === 0) state.total.requests++
  state.total.input_tokens += delta.input
  state.total.output_tokens += delta.output
  state.total.cached_read += delta.cached
  state.total.estimated_cost += delta.added
  state.total.compactions += delta.compactions
  countBreach(state.total, delta)
  state.total.cache_hit_rate = cacheHitRate(state.total)
}

/**
 * Budget breaches count once per crossing, not once per delta: increment only
 * on the first breach delta while above the budget, and reset the guard when a
 * real token delta reports being back under the budget so a future crossing
 * counts again. Compaction deltas (breach hardcoded false, zero tokens) never
 * reset the guard — they carry no budget signal. In practice tokens only
 * accumulate, so the reset is defensive; the guard mainly protects against
 * double counting across process restarts via the persisted flag.
 */
function countBreach(metrics: TokenMetrics, delta: TokenDelta): void {
  if (delta.breach) {
    if (!metrics.breach_counted) {
      metrics.budget_breaches++
      metrics.breach_counted = true
    }
  } else if (delta.compactions === 0) {
    metrics.breach_counted = false
  }
}

function cacheHitRate(metrics: TokenMetrics): number {
  const total = metrics.input_tokens + metrics.cached_read
  if (total === 0) return 0
  return metrics.cached_read / total
}

function safeCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function emptyMetrics(): TokenMetrics {
  return {
    requests: 0,
    input_tokens: 0,
    output_tokens: 0,
    cached_read: 0,
    estimated_cost: 0,
    budget_breaches: 0,
    compactions: 0,
    cache_hit_rate: 0,
    breach_counted: false,
  }
}

function emptyState(): TokenEconomyState {
  // null-prototype: "constructor"/"__proto__" as session keys must stay plain data, never hit the prototype chain
  return { version: STATE_VERSION, sessions: Object.create(null) as Record<string, TokenMetrics>, total: emptyMetrics() }
}

function isTokenEconomyState(value: unknown): value is TokenEconomyState {
  if (value === null || typeof value !== "object") return false
  const record = value as Record<string, unknown>
  if (record.version !== STATE_VERSION) return false
  if (record.sessions === null || typeof record.sessions !== "object") return false
  if (record.total === null || typeof record.total !== "object") return false
  return isMetricsRecord(record.total) && Object.values(record.sessions).every(isMetricsRecord)
}

function isMetricsRecord(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false
  const record = value as Record<string, unknown>
  return METRICS_FIELDS.every((field) => typeof record[field] === "number" && Number.isFinite(record[field]))
}