/**
 * Scope gate — anti scope creep.
 *
 * Se existe .opencode/scope.json (ou --scope.json) declarando os arquivos
 * permitidos para a tarefa, falha quando o diff toca arquivos fora do escopo.
 * Os arquivos fora de escopo são reportados para virarem item novo no backlog,
 * não para serem incluídos no mesmo PR.
 *
 * Formato do scope.json:
 *   { "allowed": ["packages/foo/src/...", "packages/foo/src/**"], "exclude": [...test...] }
 * (glob simples: * = segmento, asterisco duplo = recursivo)
 *
 * Sem scope.json → not applicable (não bloqueia).
 *
 * Exit 0 = diff dentro do escopo ou escopo não declarado. Exit 1 = fora de escopo.
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const WORKSPACE = process.env.OPENCODE_WORKSPACE ?? "/root/opencode-engos"
const BASE = process.env.OPENCODE_BASE_BRANCH ?? "dev"
const SCOPE_FILE = join(WORKSPACE, ".opencode", "scope.json")

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

function matchesGlob(file: string, pattern: string): boolean {
  const regex = pattern
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*")
  return new RegExp(`^${regex}$`).test(file)
}

if (!existsSync(SCOPE_FILE)) {
  console.log("scope: not applicable (no .opencode/scope.json — declare it to enforce scope)")
  console.log("scope: PASS")
  process.exit(0)
}

const scope = JSON.parse(readFileSync(SCOPE_FILE, "utf-8"))
const allowed: string[] = scope.allowed ?? []
const excluded: string[] = scope.exclude ?? []

if (allowed.length === 0) {
  console.log("scope: WARN scope.json without 'allowed' patterns — nothing enforced")
  console.log("scope: PASS")
  process.exit(0)
}

const base = baseRef()
if (!base) {
  console.log("scope: no base branch — cannot diff, assume in scope")
  console.log("scope: PASS")
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

const files = changedFiles()

const outOfScope = files.filter((f) => {
  if (excluded.some((p: string) => matchesGlob(f, p))) return false
  return !allowed.some((p: string) => matchesGlob(f, p))
})

// scope.json em si é sempre permitido (auto-declaração)
const cleanOutOfScope = outOfScope.filter((f) => f !== ".opencode/scope.json")

if (cleanOutOfScope.length === 0) {
  console.log(`scope: PASS (${files.length} files, all in scope)`)
  process.exit(0)
}

console.log("scope: FAIL out-of-scope files (move to new backlog items, not this PR):")
for (const f of cleanOutOfScope) console.log(`scope:   ${f}`)
console.log(`scope: allowed patterns: ${allowed.join(", ")}`)
console.log("scope: FAIL")
process.exit(1)