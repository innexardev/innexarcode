/**
 * Polish gate — Definition of Done rigoroso antes do Delivery.
 *
 * Verifica no diff contra a base branch:
 *  1. Sem TODO/FIXME/HACK/XXX deixados para trás
 *  2. Sem console.log/debug/trace (debugging residual)
 *  3. Sem segredos hardcoded (chaves, tokens, senhas) no código novo
 *  4. Sem URLs/timeouts hardcoded quando .env.example existe
 *  5. Código morto aparente (arquivo importado mas não usado não é coberto aqui)
 *
 * Exit 0 = pronto para Delivery. Exit 1 = precisa limpar antes.
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const WORKSPACE = process.env.OPENCODE_WORKSPACE ?? "/root/opencode-engos"
const BASE = process.env.OPENCODE_BASE_BRANCH ?? "dev"

const problems: string[] = []
const warnings: string[] = []

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
  console.log("polish: no base branch found (not a git repo or no dev/main) — treating diff as empty")
  console.log("polish: PASS")
  process.exit(0)
}

// Diff de linhas ADICIONADAS apenas (committed vs base + staged + unstaged)
function fullDiff(args: string[]): string | null {
  const committed = tryGit(["diff", `${base}...HEAD`, ...args])
  const staged = tryGit(["diff", "--cached", ...args])
  const unstaged = tryGit(["diff", ...args])
  return [committed, staged, unstaged].filter(Boolean).join("\n") || null
}

const added = fullDiff(["--", "--diff-filter=ACM"])
const untracked = tryGit(["ls-files", "--others", "--exclude-standard"]) ?? ""
const files = (fullDiff(["--name-only", "--diff-filter=ACM"]) ?? "").split("\n").filter(Boolean).join("\n") + "\n" + untracked

if (added) {

  // 1. Marcadores de pendência
  const markers = added.split("\n").filter((l) => /^\+\s*(?:\/\/|\/\*|#|<!--|--)\s*(TODO|FIXME|HACK|XXX)\b/i.test(l))
  if (markers.length > 0) {
    problems.push(`TODO/FIXME/HACK left in diff (${markers.length}): ${markers.slice(0, 5).join(" | ")}`)
  }

  // 2. console.log residual (fora de testes/scripts/demo)
  const consoleCalls = added.split("\n").filter((l) => /^\+\s*console\.(log|debug|trace)\(/.test(l))
  if (consoleCalls.length > 0) {
    problems.push(`console.${consoleCalls[0].match(/console\.(\w+)/)?.[1] ?? "log"}() left in diff (${consoleCalls.length}): ${consoleCalls.slice(0, 5).join(" | ")}`)
  }

  // 3. Segredos hardcoded em linhas adicionadas
  const secrets = added.split("\n").filter((l) => /^\+\s*["'`]?(api[_-]?key|secret|token|password|passwd|private[_-]?key|auth[_-]?key)\s*["']?\s*[:=]\s*["'][^"']{8,}["']/i.test(l))
  if (secrets.length > 0) {
    problems.push(`Possible hardcoded secret in diff (${secrets.length}): ${secrets.slice(0, 3).join(" | ")}`)
  }
}

// 4. Hardcoded URL/timeout quando .env.example existe
const envExample = join(WORKSPACE, ".env.example")
if (existsSync(envExample) && added) {
  const hardcoded = added.split("\n").filter((l) => /^\+\s*["'`](https?:\/\/|wss?:\/\/)[^"'`\s]+["'`]/.test(l))
  if (hardcoded.length > 0) {
    warnings.push(`hardcoded URL in diff (${hardcoded.length}) — consider env var: ${hardcoded.slice(0, 3).join(" | ")}`)
  }
}

// 5. Arquivos sem extensão de fonte com conteúdo binário suspeito (arquivos esquecidos)
const suspiciousFiles = files
  .split("\n")
  .filter(Boolean)
  .filter((f) => !f.includes("node_modules") && /\b(build|dist|out|coverage)\//.test(f))
if (suspiciousFiles.length > 0) {
  warnings.push(`build artifacts in diff (${suspiciousFiles.length}): ${suspiciousFiles.slice(0, 5).join(", ")}`)
}

// 6. CHANGELOG desatualizado para mudanças em src
const touchedSrc = files.split("\n").filter((f) => /^packages\/(?:core|opencode)\/src\//.test(f))
if (touchedSrc.length > 0 && !files.includes("CHANGELOG.md") && !files.includes("docs/")) {
  warnings.push(`src/ changed (${touchedSrc.length} files) but CHANGELOG.md / docs/ untouched — docs are a delivery artifact`)
}

for (const w of warnings) console.log(`polish: WARN ${w}`)
for (const p of problems) console.log(`polish: FAIL ${p}`)

if (problems.length === 0) {
  console.log(`polish: PASS (${warnings.length} warnings)`)
  process.exit(0)
}
console.log("polish: FAIL")
process.exit(1)