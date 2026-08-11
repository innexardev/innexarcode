/**
 * Token economy gate — seção 12: auditoria de custo/contexto do agente.
 *
 * Advisory apenas (exit 0 sempre). Verifica:
 *  1. Arquivo de métricas ~/.opencode/token-economy.json existe
 *  2. Métricas registradas (requests > 0) e cache hit rate saudável (> 60%)
 *  3. Estimador de tokens disponível em packages/core/src
 */
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const WORKSPACE = process.env.OPENCODE_WORKSPACE ?? "/root/opencode-engos"
const METRICS_PATH = join(homedir(), ".opencode", "token-economy.json")

const warnings: string[] = []
const passes: string[] = []

if (existsSync(METRICS_PATH)) {
  passes.push("metrics file present")
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(METRICS_PATH, "utf-8"))
  } catch {
    warnings.push("metrics file present but unparsable — run sessions to regenerate it")
  }
  if (parsed && typeof parsed === "object") {
    const total = (parsed as Record<string, unknown>).total as Record<string, number> | undefined
    if (total && typeof total.requests === "number" && total.requests > 0) {
      const cost = typeof total.estimated_cost === "number" ? total.estimated_cost.toFixed(4) : "0"
      passes.push(`token economy metrics recorded (requests: ${total.requests}, cost: $${cost})`)
    } else {
      warnings.push("no token economy metrics recorded yet (run sessions first)")
    }
    if (total && typeof total.cache_hit_rate === "number" && total.cache_hit_rate > 0.6) {
      passes.push(`cache hit rate healthy (${Math.round(total.cache_hit_rate * 100)}%)`)
    } else {
      warnings.push("cache hit rate below 60%")
    }
  }
} else {
  warnings.push("no token metrics yet (run sessions first)")
}

function scanForEstimator(dir: string, depth: number): string | undefined {
  if (depth > 5) return undefined
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      const found = scanForEstimator(full, depth + 1)
      if (found) return found
      continue
    }
    if (!entry.name.endsWith(".ts") || entry.name.includes(".test.")) continue
    try {
      if (readFileSync(full, "utf-8").includes("estimateTokens")) return full
    } catch {
      // skip unreadable
    }
  }
  return undefined
}

const coreSrc = join(WORKSPACE, "packages", "core", "src")
const coreTokensFile = join(coreSrc, "pipeline", "token-economy.ts")
const estimatorFile = existsSync(coreTokensFile) && scanForEstimator(coreSrc, 0)
if (estimatorFile) {
  passes.push("token estimator available in core")
} else {
  warnings.push("token estimator not found in packages/core/src")
}

// No-cache-hack check: the stable-layer validator must exist and reject volatile markers,
// so the cache-safe invariant (stable prefix never polluted with timestamps) is enforceable.
if (existsSync(coreTokensFile)) {
  const coreSource = readFileSync(coreTokensFile, "utf-8")
  if (coreSource.includes("function validateStable") && coreSource.includes("CacheOrderViolation")) {
    passes.push("cache-order invariant present (validateStable + CacheOrderViolation)")
  } else {
    warnings.push("cache-order invariant missing in core token-economy module")
  }
  // Estimator wired into the tool output path (tool imports TokenEconomy from core).
  const toolFile = join(WORKSPACE, "packages", "opencode", "src", "tool", "token-economy.ts")
  if (existsSync(toolFile) && readFileSync(toolFile, "utf-8").includes("TokenEconomy")) {
    passes.push("token estimator used by the tool output path")
  } else {
    warnings.push("token estimator not used by the tool output path")
  }
} else {
  warnings.push("core token-economy module missing")
}

for (const p of passes) console.log(`token-economy: PASS ${p}`)
for (const w of warnings) console.log(`token-economy: WARN ${w}`)

if (warnings.length > 0) {
  console.log(`token-economy: PASS (${passes.length} ok / ${warnings.length} warnings)`)
} else {
  console.log(`token-economy: PASS (${passes.length} ok)`)
}
process.exit(0)