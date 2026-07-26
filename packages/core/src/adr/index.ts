export * as Adr from "./index"

import { Context, Effect, Layer, Option, Schema } from "effect"

// ── Schema ──────────────────────────────────────────────────────────────────

export const AdrStatus = Schema.Union([
  Schema.Literal("proposed"),
  Schema.Literal("accepted"),
  Schema.Literal("deprecated"),
  Schema.Literal("superseded"),
])
export type AdrStatus = typeof AdrStatus.Type

export const Domain = Schema.Union([
  Schema.Literal("backend"),
  Schema.Literal("frontend"),
  Schema.Literal("database"),
  Schema.Literal("infra"),
  Schema.Literal("architecture"),
  Schema.Literal("security"),
  Schema.Literal("ux"),
])
export type Domain = typeof Domain.Type

export const AdrRecord = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  status: AdrStatus,
  context: Schema.String,
  decision: Schema.String,
  consequences: Schema.String,
  date: Schema.Number,
  tags: Schema.Array(Schema.String),
  supersededBy: Schema.optional(Schema.Number),
  references: Schema.Array(Schema.String),
  domain: Domain,
})
export type Adr = typeof AdrRecord.Type

export const AdrLog = Schema.Struct({ records: Schema.Array(AdrRecord) })
export type AdrLog = typeof AdrLog.Type

// ── Templates & Helpers ─────────────────────────────────────────────────────

export const ADR_TEMPLATE = `\
# ADR {id}: {title}

- **Status:** {status}
- **Date:** {date}
- **Domain:** {domain}
- **Tags:** {tags}

## Context

{context}

## Decision

{decision}

## Consequences

{consequences}

{references}`

function padId(id: number): string {
  return String(id).padStart(3, "0")
}

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function generateAdrFilename(adr: Adr): string {
  return `${padId(adr.id)}-${toSlug(adr.title)}.md`
}

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  backend: ["api", "server", "endpoint", "rest", "graphql", "service", "microservice", "middleware"],
  frontend: ["ui", "component", "page", "react", "vue", "angular", "css", "style", "frontend"],
  database: ["database", "sql", "nosql", "schema", "migration", "query", "index", "table", "redis", "cache"],
  infra: ["deploy", "docker", "kubernetes", "ci", "cd", "pipeline", "infrastructure", "cloud", "terraform"],
  architecture: ["architecture", "pattern", "design", "module", "dependency", "structure", "monorepo"],
  security: ["security", "auth", "oauth", "jwt", "encrypt", "vulnerability", "permission", "rbac"],
  ux: ["ux", "user experience", "accessibility", "a11y", "usability", "workflow", "design"],
}

const TECH_KEYWORDS: string[] = [
  "typescript", "javascript", "python", "rust", "go", "react", "node", "bun",
  "docker", "postgres", "redis", "graphql", "rest", "grpc", "kafka", "sqlite",
  "aws", "azure", "gcp", "terraform", "kubernetes", "oauth", "jwt",
  "effect", "schema", "drizzle", "prisma", "nextjs", "tailwind",
]

function inferDomain(text: string): Domain {
  const lower = text.toLowerCase()
  let best: Domain = "architecture"
  let bestScore = 0
  for (const domain of Object.keys(DOMAIN_KEYWORDS)) {
    const keywords = DOMAIN_KEYWORDS[domain]
    const score = keywords.filter((k) => lower.includes(k)).length
    if (score > bestScore) {
      bestScore = score
      best = domain as Domain
    }
  }
  return best
}

function extractTags(text: string): string[] {
  const lower = text.toLowerCase()
  const found = TECH_KEYWORDS.filter((k) => lower.includes(k))
  return [...new Set(found)].slice(0, 8)
}

function formatDate(unix: number): string {
  return new Date(unix * 1000).toISOString().split("T")[0]
}

function formatReferences(refs: readonly string[]): string {
  if (refs.length === 0) return ""
  return "\n## References\n\n" + refs.map((r) => `- ${r}`).join("\n")
}

function statusLabel(adr: Adr): string {
  if (adr.supersededBy) return `${adr.status} (superseded by ADR ${adr.supersededBy})`
  return adr.status
}

export function adrToMarkdown(adr: Adr): string {
  return ADR_TEMPLATE
    .replace("{id}", padId(adr.id))
    .replace("{title}", adr.title)
    .replace("{status}", statusLabel(adr))
    .replace("{date}", formatDate(adr.date))
    .replace("{domain}", adr.domain)
    .replace("{tags}", adr.tags.join(", "))
    .replace("{context}", adr.context)
    .replace("{decision}", adr.decision)
    .replace("{consequences}", adr.consequences)
    .replace("{references}", formatReferences(adr.references))
}

// ── Service Interface ──────────────────────────────────────────────────────

export interface Interface {
  readonly list: () => Effect.Effect<Adr[]>
  readonly get: (id: number) => Effect.Effect<Adr | undefined>
  readonly create: (input: Omit<Adr, "id" | "date">) => Effect.Effect<Adr>
  readonly updateStatus: (id: number, status: AdrStatus, supersededBy?: number) => Effect.Effect<void>
  readonly search: (query: string) => Effect.Effect<Adr[]>
  readonly listByDomain: (domain: Domain) => Effect.Effect<Adr[]>
  readonly listByStatus: (status: AdrStatus) => Effect.Effect<Adr[]>
  readonly load: (path: string) => Effect.Effect<AdrLog>
  readonly save: (path: string, log: AdrLog) => Effect.Effect<void>
  readonly generateMarkdown: (adr: Adr) => Effect.Effect<string>
  readonly fromDecision: (context: string, decision: string, consequences: string) => Effect.Effect<Adr>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/Adr") {}

// ── Layer ───────────────────────────────────────────────────────────────────

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    let log: AdrLog = { records: [] }

    return Service.of({
      list: () => Effect.sync(() => [...log.records]),

      get: Effect.fn("Adr.get")(function* (id) {
        return log.records.find((r) => r.id === id)
      }),

      create: Effect.fn("Adr.create")(function* (input) {
        const id = log.records.reduce((max, r) => r.id > max ? r.id : max, 0) + 1
        const adr: Adr = {
          id,
          title: input.title,
          status: input.status,
          context: input.context,
          decision: input.decision,
          consequences: input.consequences,
          date: Math.floor(Date.now() / 1000),
          tags: [...input.tags],
          supersededBy: input.supersededBy,
          references: [...input.references],
          domain: input.domain,
        }
        log = { records: [...log.records, adr] }
        return adr
      }),

      updateStatus: Effect.fn("Adr.updateStatus")(function* (id, status, supersededBy) {
        log = {
          records: log.records.map((r) =>
            r.id === id
              ? { ...r, status, ...(supersededBy !== undefined ? { supersededBy } : {}) }
              : r,
          ),
        }
      }),

      search: Effect.fn("Adr.search")(function* (query) {
        const q = query.toLowerCase()
        return log.records.filter(
          (r) =>
            r.title.toLowerCase().includes(q) ||
            r.context.toLowerCase().includes(q) ||
            r.decision.toLowerCase().includes(q) ||
            r.consequences.toLowerCase().includes(q) ||
            r.tags.some((t) => t.toLowerCase().includes(q)),
        )
      }),

      listByDomain: Effect.fn("Adr.listByDomain")(function* (domain) {
        return log.records.filter((r) => r.domain === domain)
      }),

      listByStatus: Effect.fn("Adr.listByStatus")(function* (status) {
        return log.records.filter((r) => r.status === status)
      }),

      load: Effect.fn("Adr.load")(function* (filepath) {
        const text = yield* Effect.tryPromise(() => Bun.file(filepath).text()).pipe(
          Effect.orElseSucceed(() => "{}"),
        )
        const raw: unknown = JSON.parse(text)
        const decoded = Option.getOrElse(
          Schema.decodeUnknownOption(AdrLog)(raw),
          () => ({ records: [] }) as unknown as AdrLog,
        )
        log = decoded
        return decoded
      }),

      save: Effect.fn("Adr.save")(function* (filepath, data) {
        const json = JSON.stringify(data, null, 2)
        yield* Effect.tryPromise(() => Bun.write(filepath, json)).pipe(Effect.orDie)
      }),

      generateMarkdown: Effect.fn("Adr.generateMarkdown")(function* (adr) {
        return adrToMarkdown(adr)
      }),

      fromDecision: Effect.fn("Adr.fromDecision")(function* (context, decision, consequences) {
        const title = decision.split("\n")[0].replace(/\.$/, "")
        const combined = context + " " + decision
        const domain = inferDomain(combined)
        const tags = extractTags(combined)
        return {
          id: 0,
          title,
          status: "proposed" as AdrStatus,
          context,
          decision,
          consequences,
          date: Math.floor(Date.now() / 1000),
          tags,
          supersededBy: undefined,
          references: [],
          domain,
        }
      }),
    })
  }),
)
