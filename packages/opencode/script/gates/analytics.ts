/**
 * Analytics gate — seção 12.6: instrumentação de Analytics.
 *
 * Regra: toda feature nova client-facing deve DECLARAR quais eventos serão
 * trackeados. Sem declaração → WARN (evita "lançar no escuro" sem dado de uso).
 *
 * Declaração aceita em qualquer destas formas:
 *  1. `.opencode/analytics.json` — { "events": [{ "name", "feature", "params" }] }
 *  2. Código com chamada de tracking (track/analytics/gtag/posthog/amplitude/
 *     segment) na página nova
 *  3. `.opencode/analytics.md` listando eventos por feature
 *
 * Só dispara quando há feature client-facing nova (page.tsx, route.tsx, tela).
 *
 * Exit 0 sempre (WARN informativo).
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const WORKSPACE = process.env.OPENCODE_WORKSPACE ?? "/root/opencode-engos"
const BASE = process.env.OPENCODE_BASE_BRANCH ?? "dev"

function tryGit(args: string[]): string | null {
  try {
    return execFileSync("git", args, { cwd: WORKSPACE, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] })
  } catch {
    return null
  }
}

function baseRef(): string | null {
  for (const ref of [BASE, "origin/dev", "origin/main", "HEAD~1"]) {
    const ok = tryGit(["rev-parse", "--verify", "--quiet", ref])
    if (ok !== null && ok.trim() !== "") return ref
  }
  return null
}

const base = baseRef()
if (!base) {
  console.log("analytics: no base branch — cannot detect new features")
  console.log("analytics: PASS")
  process.exit(0)
}

const out: string[] = []
for (const args of [
  ["diff", `${base}...HEAD`, "--name-only", "--diff-filter=ACM"],
  ["diff", "--cached", "--name-only", "--diff-filter=ACM"],
  ["diff", "--name-only", "--diff-filter=ACM"],
]) {
  const r = tryGit(args)
  if (r) out.push(...r.split("\n").filter(Boolean))
}

const newClientFacing = [...new Set(out)].filter((f) =>
  !f.includes(".test.") &&
  !f.includes("node_modules") &&
  /(^|\/)(page|route|screen|view)\.[jt]sx?$/.test(f) ||
  /(^|\/)app\/.*\/(page|route)\.[jt]sx?$/.test(f),
)

if (newClientFacing.length === 0) {
  console.log("analytics: not applicable (no new client-facing page/screen)")
  console.log("analytics: PASS")
  process.exit(0)
}

// 1. analytics.json
const analyticsJson = join(WORKSPACE, ".opencode", "analytics.json")
if (existsSync(analyticsJson)) {
  try {
    const data = JSON.parse(readFileSync(analyticsJson, "utf-8"))
    const events = data.events ?? []
    console.log(`analytics: PASS — ${events.length} analytics events declared in .opencode/analytics.json`)
    process.exit(0)
  } catch {
    console.log("analytics: WARN .opencode/analytics.json exists but is invalid JSON")
  }
}

// 2. analytics.md
const analyticsMd = join(WORKSPACE, ".opencode", "analytics.md")
if (existsSync(analyticsMd)) {
  console.log("analytics: PASS — .opencode/analytics.md present (events declared there)")
  process.exit(0)
}

// 3. tracking inline nas páginas novas
const TRACKING_RE = /(track|analytics|gtag|posthog|amplitude|segment|plausible|matomo|mixpanel)\./i
const noTracking: string[] = []
for (const page of newClientFacing) {
  const full = join(WORKSPACE, page)
  if (!existsSync(full)) continue
  const content = readFileSync(full, "utf-8")
  if (!TRACKING_RE.test(content)) noTracking.push(page)
}

if (noTracking.length === 0) {
  console.log(`analytics: PASS — all ${newClientFacing.length} new pages include tracking calls`)
  process.exit(0)
}

console.log(`analytics: WARN — ${noTracking.length} new client-facing page(s) without analytics events:`)
for (const p of noTracking.slice(0, 8)) console.log(`analytics:   ${p}`)
console.log("analytics: WARN declare events — .opencode/analytics.json, .opencode/analytics.md, or track() calls — antes de lançar no escuro")
console.log("analytics: PASS (with warning)")
process.exit(0)