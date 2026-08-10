/**
 * Onboarding gate — seção 12.5: tour de onboarding no produto.
 *
 * Regra: toda feature nova client-facing deve DECLARAR se precisa de tour/
 * onboarding ou não. Sem declaração → WARN (evita esquecimento silencioso).
 *
 * Declaração aceita em qualquer destas formas:
 *  1. `.opencode/features.json` — { "features": [{ "id", "onboarding": true|false }] }
 *  2. Comentário na página nova: `// onboarding: false` ou `// onboarding: true`
 *     (também aceito em comentário multilinha)
 *  3. Arquivo `.opencode/onboarding.md` listando features com onboarding
 *
 * Só dispara quando há feature client-facing nova no diff (page.tsx, route.tsx,
 * tela nova). Sem feature nova → not applicable.
 *
 * Exit 0 sempre (WARN informativo — declaração é decisão de produto).
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
  console.log("onboarding: no base branch — cannot detect new features")
  console.log("onboarding: PASS")
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
  console.log("onboarding: not applicable (no new client-facing page/screen)")
  console.log("onboarding: PASS")
  process.exit(0)
}

// 1. features.json
const featuresJson = join(WORKSPACE, ".opencode", "features.json")
if (existsSync(featuresJson)) {
  try {
    const data = JSON.parse(readFileSync(featuresJson, "utf-8"))
    const declared = (data.features ?? []).filter((f: { onboarding?: unknown }) => typeof f.onboarding === "boolean")
    console.log(`onboarding: PASS — ${declared.length} features declared in .opencode/features.json (onboarding: ${declared.filter((f: { onboarding: boolean }) => f.onboarding).length} true / ${declared.filter((f: { onboarding: boolean }) => !f.onboarding).length} false)`)
    process.exit(0)
  } catch {
    console.log("onboarding: WARN .opencode/features.json exists but is invalid JSON")
  }
}

// 2. onboarding.md
const onboardingMd = join(WORKSPACE, ".opencode", "onboarding.md")
if (existsSync(onboardingMd)) {
  console.log("onboarding: PASS — .opencode/onboarding.md present (features declare onboarding there)")
  process.exit(0)
}

// 3. comentário inline nas páginas novas
const undeclared: string[] = []
for (const page of newClientFacing) {
  const full = join(WORKSPACE, page)
  if (!existsSync(full)) continue
  const content = readFileSync(full, "utf-8")
  const declared = /onboarding\s*[:=]\s*(true|false)/i.test(content)
  if (!declared) undeclared.push(page)
}

if (undeclared.length === 0) {
  console.log(`onboarding: PASS — all ${newClientFacing.length} new pages declare onboarding inline`)
  process.exit(0)
}

console.log(`onboarding: WARN — ${undeclared.length} new client-facing page(s) do not declare onboarding needs:`)
for (const p of undeclared.slice(0, 8)) console.log(`onboarding:   ${p}`)
console.log("onboarding: WARN declare per feature — .opencode/features.json, .opencode/onboarding.md, or `// onboarding: true|false` in the page")
console.log("onboarding: PASS (with warning)")
process.exit(0)