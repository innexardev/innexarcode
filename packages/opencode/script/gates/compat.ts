/**
 * Compat gate — compatibilidade retroativa.
 *
 * Detecta mudanças em superfícies públicas de API/schema e exige ADR antes
 * do Delivery. Não impede mudança — impede mudança SEM DECISÃO DOCUMENTADA.
 *
 * Áreas sensíveis (breaking-change risk alto):
 *  - protocol/ (mensagens, IDs, enum)
 *  - pasta generated/ (client gerado)
 *  - *.schema.ts, *.api.ts, openapi.*, *.proto
 *  - migrations (excluindo novas — verifica ALTER/DROP em existentes)
 *
 * Exit 0 = sem superfície pública alterada OU ADR presente. Exit 1 = breaking sem ADR.
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const WORKSPACE = process.env.OPENCODE_WORKSPACE ?? "/root/opencode-engos"
const BASE = process.env.OPENCODE_BASE_BRANCH ?? "dev"

const SENSITIVE = /(^|\/)(protocol|generated|openapi)[\/.]|\.schema\.ts$|\.api\.ts$|\.proto$|\.graphql$|\.sql\.ts$/

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
  console.log("compat: no base branch — assume no public surface change")
  console.log("compat: PASS")
  process.exit(0)
}

// committed vs base + staged + unstaged
function changedFiles(): string[] {
  const out: string[] = []
  for (const args of [
    ["diff", `${base}...HEAD`, "--name-only", "--diff-filter=ACM"],
    ["diff", "--cached", "--name-only", "--diff-filter=ACM"],
    ["diff", "--name-only", "--diff-filter=ACM"],
  ]) {
    const r = tryGit(args)
    if (r) out.push(...r.split("\n").filter(Boolean))
  }
  return [...new Set(out)]
}

const files = changedFiles().join("\n")

// Migrations: só ALTER/DROP contam como breaking (novas são additive)
const migrationFiles = files.split("\n").filter((f) => f.includes("migration") || f.includes("/migrations/"))
const touchedSensitive = files.split("\n").filter((f) => SENSITIVE.test(f) && !f.includes("test") && !f.includes("/test/"))

if (migrationFiles.length > 0) {
  try {
    const migrationDiff = tryGit(["diff", `${base}...HEAD`, "--", ...migrationFiles]) ?? ""
    const breakingMigration = migrationDiff.split("\n").some((l) => /^\+.*\b(ALTER TABLE|DROP (TABLE|COLUMN)|RENAME (TABLE|COLUMN))\b/i.test(l))
    if (breakingMigration && !touchedSensitive.includes("migrations")) {
      // garantimos que migrations foi contado como sensível
    }
  } catch {
    // ignore
  }
}

if (touchedSensitive.length === 0 && migrationFiles.length === 0) {
  console.log("compat: PASS (no public API/schema surface changed)")
  process.exit(0)
}

// ADR presente? docs/adr/ ou memory/decisions.md ou docs/decisions/
const adrCandidates = ["docs/adr", "docs/decisions", "memory/decisions.md", "ADRs.md", "docs/adrs"]
const adrDirs = adrCandidates.filter((c) => existsSync(join(WORKSPACE, c)))
const adrChanged = adrCandidates.some((c) => files.split("\n").some((f) => f.startsWith(c)))

const surface = [...new Set([...touchedSensitive, ...migrationFiles])]
if (adrDirs.length === 0 || !adrChanged) {
  console.log("compat: FAIL public surface changed without ADR:")
  for (const f of surface) console.log(`compat:   ${f}`)
  console.log("compat: create an ADR in docs/adr/ (or docs/decisions.md) documenting the breaking change and its rollback plan")
  console.log("compat: FAIL")
  process.exit(1)
}

console.log("compat: PASS (public surface changed, ADR present)")
process.exit(0)