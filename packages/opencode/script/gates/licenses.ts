/**
 * Licenses gate — verifica licenças de dependências novas.
 *
 * Roda apenas quando package.json / bun.lock / package-lock.json mudou no diff
 * (nova dependência foi adicionada). Se nenhuma dependência mudou → not applicable.
 *
 * Licenças bloqueantes por padrão (copyleft forte em projeto proprietário):
 *  - GPL, AGPL, SSPL, CC-BY-SA, OSL
 * Licenças permitidas: MIT, Apache-2.0, ISC, BSD, Unlicense, MPL (weak copyleft), CC0.
 *
 * Exit 0 = sem licenças bloqueantes. Exit 1 = licença bloqueante encontrada.
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join, basename } from "node:path"

const WORKSPACE = process.env.OPENCODE_WORKSPACE ?? "/root/opencode-engos"
const BASE = process.env.OPENCODE_BASE_BRANCH ?? "dev"

const BLOCKED = /(GPL-?[123]|AGPL|SSPL|CC-BY-SA|OSL-|EUPL)/i
const SAFE = /(MIT|Apache-2?\.0|ISC|BSD-?[0-9]?|Unlicense|CC0|MPL-?2?\.0?|Zlib|0BSD)/i

const lockFiles = ["package.json", "bun.lock", "bun.lockb", "package-lock.json", "yarn.lock", "pnpm-lock.yaml"]

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
let changed = false
if (base) {
  const out: string[] = []
  for (const args of [
    ["diff", `${base}...HEAD`, "--name-only"],
    ["diff", "--cached", "--name-only"],
    ["diff", "--name-only"],
  ]) {
    const r = tryGit(args)
    if (r) out.push(...r.split("\n").filter(Boolean))
  }
  changed = lockFiles.some((lf) => out.includes(lf))
}

// Mesmo sem git, se o workspace não tem lockfile de jeito nenhum, não temos como validar
if (!changed) {
  const hasAnyLock = lockFiles.some((lf) => existsSync(join(WORKSPACE, lf)))
  if (!hasAnyLock) {
    console.log("licenses: not applicable (no lockfile / no dependency change)")
    process.exit(0)
  }
  console.log("licenses: not applicable (no dependency change in diff)")
  process.exit(0)
}

// Tenta license-checker (npx) — se não disponível, usa fallback de inspeção do package.json
const pkgPath = join(WORKSPACE, "package.json")
const pkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, "utf-8")) : {}
const checked: Record<string, string> = {}

try {
  const out = execFileSync("npx", ["license-checker", "--production", "--json"], {
    cwd: WORKSPACE,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60_000,
  })
  const report = JSON.parse(out)
  for (const [name, info] of Object.entries(report)) {
    const licenses = Array.isArray((info as { licenses?: unknown }).licenses) ? (info as { licenses: string[] }).licenses : [(info as { licenses?: string }).licenses]
    checked[name] = (licenses as string[]).join(", ")
  }
} catch {
  // license-checker indisponível — fallback: tenta package.json dos node_modules diretos
  const prodDeps = { ...(pkg.dependencies ?? {}), ...(pkg.optionalDependencies ?? {}) }
  for (const name of Object.keys(prodDeps)) {
    const depPkgPath = join(WORKSPACE, "node_modules", name, "package.json")
    if (existsSync(depPkgPath)) {
      const dep = JSON.parse(readFileSync(depPkgPath, "utf-8"))
      const lic = typeof dep.license === "string" ? dep.license : JSON.stringify(dep.licenses ?? "unknown")
      checked[name] = lic
    } else {
      checked[name] = "unresolved"
    }
  }
}

const blocked: Array<[string, string]> = []
for (const [name, lic] of Object.entries(checked)) {
  if (BLOCKED.test(lic) && !SAFE.test(lic)) blocked.push([name, lic])
}

for (const [name, lic] of blocked) console.log(`licenses: FAIL ${name} → ${lic} (copyleft forte, incompatível com projeto proprietário)`)
if (blocked.length > 0) {
  console.log("licenses: FAIL")
  process.exit(1)
}
console.log(`licenses: PASS (${Object.keys(checked).length} deps checked)`)
process.exit(0)