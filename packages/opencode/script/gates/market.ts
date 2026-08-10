/**
 * Market gate — validação de demanda real (Pesquisa de Mercado condicional).
 *
 * NÃO bloqueia tarefas pequenas (bugfix, ajuste técnico). Dispara apenas quando
 * o diff indica funcionalidade visível ao usuário final:
 *  - Endpoint público novo (routes: app.get/post, router.*, @Get/@Post, route handlers)
 *  - Tela nova (page.tsx, routes.tsx, telas em app/)
 *  - Mudança de pricing/onboarding/checkout (arquivos com esses nomes)
 *
 * Quando dispara, verifica se existe demanda registrada (lastro):
 *  - Backlog do projeto (.opencode/backlog.json, BACKLOG.md, TODO.md, roadmap*)
 *  - Tickets/PRDs/requisitos (docs/*.md com PRD/requirement/feature, .github/ISSUE*)
 *  - Feedback de usuário registrado (docs/feedback*, memory/*)
 *
 * Sem demanda registrada → WARN (não bloqueia, mas sinaliza risco de construir
 * sem lastro — recomendação: registrar item no backlog antes).
 *
 * Exit 0 sempre (gate condicional, WARN informativo).
 */
import { execFileSync } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

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
  console.log("market: no base branch — cannot detect new features")
  console.log("market: PASS")
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
const files = [...new Set(out)]

// 1. Detecta superfície user-facing nova
const newEndpoint = files.filter((f) =>
  !f.includes(".test.") &&
  !f.includes("node_modules") &&
  /(^|\/)(api|routes?|controllers?|endpoints?)\//.test(f) ||
  /\.(route|api)\.[jt]sx?$/.test(f) ||
  /(^|\/)(page|route)\.[jt]sx?$/.test(f),
)

const userFacing = files.filter((f) =>
  /(^|\/)(page|route|screen|view|telas?)\.[jt]sx?$/.test(f) ||
  /(^|\/)pages?\//.test(f) ||
  /(^|\/)app\/.*\/(page|route)\.[jt]sx?$/.test(f),
)

const pricingFlow = files.filter((f) => /(pricing|checkout|onboarding|billing|assinatura|plano)/i.test(f))

const triggered = newEndpoint.length > 0 || userFacing.length > 0 || pricingFlow.length > 0
if (!triggered) {
  console.log("market: not applicable (no user-facing surface changed — bugfix/tech task)")
  console.log("market: PASS")
  process.exit(0)
}

// 2. Procura demanda registrada
function hasDemandEvidence(): boolean {
  // backlog do projeto
  for (const f of [".opencode/backlog.json", "BACKLOG.md", "backlog.md", "TODO.md", "roadmap.md", "ROADMAP.md", ".github/ISSUE_TEMPLATE"]) {
    if (existsSync(join(WORKSPACE, f))) return true
  }
  // docs com requisitos/PRD/feature
  const docsDir = join(WORKSPACE, "docs")
  if (existsSync(docsDir)) {
    const walk = (dir: string, depth: number): boolean => {
      if (depth > 3) return false
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (walk(join(dir, entry.name), depth + 1)) return true
        } else if (/(prd|requirement|requisito|feature|ticket|feedback|pesquisa|research)/i.test(entry.name)) {
          return true
        }
      }
      return false
    }
    return walk(docsDir, 0)
  }
  // backlog global do agente
  if (existsSync(join(homedir(), ".opencode", "backlog.json"))) return true
  return false
}

const hasDemand = hasDemandEvidence()
const detected: string[] = [
  ...(newEndpoint.length > 0 ? [`endpoints novos (${newEndpoint.length}): ${newEndpoint.slice(0, 3).join(", ")}`] : []),
  ...(userFacing.length > 0 ? [`telas novas (${userFacing.length}): ${userFacing.slice(0, 3).join(", ")}`] : []),
  ...(pricingFlow.length > 0 ? [`fluxo pricing/onboarding (${pricingFlow.length}): ${pricingFlow.slice(0, 3).join(", ")}`] : []),
]

if (hasDemand) {
  console.log("market: PASS — user-facing change detected with registered demand:")
  for (const d of detected) console.log(`market:   ${d}`)
  process.exit(0)
}

console.log("market: WARN — user-facing change detected WITHOUT registered demand:")
for (const d of detected) console.log(`market:   ${d}`)
console.log("market: WARN construir sem lastro em necessidade real — registre a feature no backlog (backlog-add) e valide demanda antes de investir")
console.log("market: PASS (with warning)")
process.exit(0)