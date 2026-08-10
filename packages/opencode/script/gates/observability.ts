/**
 * Observability gate — seção 7: observabilidade do PRODUTO entregue.
 *
 * Diferente do ObservabilityEngine (que monitora a execução do agente),
 * isto verifica que o código entregue nasce com observabilidade:
 *  1. Logging estruturado (pino, winston, morgan, logfmt, structured logs)
 *  2. Health check endpoint (/health, /healthz, /ready, healthcheck, liveness)
 *  3. Métricas básicas (prom-client, opentelemetry, metrics, counters)
 *
 * Regras:
 *  - Serviço (api/web com backend/infra): health check é OBRIGATÓRIO (FAIL)
 *  - Logging estruturado: WARN se ausente (recomendado, não bloqueante)
 *  - Métricas: WARN se ausente (depende do caso)
 *  - Frontend puro (sem server): not applicable
 *  - CLI/ferramenta sem server: verifica apenas logging
 *
 * Suporte a monorepos: agrega dependencies de raiz + packages/*, apps/* e
 * services/* (collectDeps) e detecta indicadores de serviço em cada um.
 *
 * Exit 0 = ok/not applicable. Exit 1 = serviço sem health check.
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const WORKSPACE = process.env.OPENCODE_WORKSPACE ?? "/root/opencode-engos"

const pkgPath = join(WORKSPACE, "package.json")
if (!existsSync(pkgPath)) {
  console.log("observability: not applicable (no package.json)")
  process.exit(0)
}

const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"))

// Agrega dependencies + devDependencies da raiz e de todos os subpacotes
// (packages/*, apps/*, services/*) num único Record. Ignora node_modules.
function collectDeps(): Record<string, string> {
  const all: Record<string, string> = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
  for (const sub of ["packages", "apps", "services"]) {
    const dir = join(WORKSPACE, sub)
    if (!existsSync(dir)) continue
    for (const entry of readdirSync(dir)) {
      const pkgFile = join(dir, entry, "package.json")
      if (entry === "node_modules" || !existsSync(pkgFile)) continue
      try {
        const subPkg = JSON.parse(readFileSync(pkgFile, "utf-8"))
        Object.assign(all, subPkg.dependencies ?? {}, subPkg.devDependencies ?? {})
      } catch {
        // package.json inválido — ignora
      }
    }
  }
  return all
}

const deps = collectDeps()

const LOGGING_LIBS = ["pino", "winston", "morgan", "bunyan", "log4js", "loglevel", "@google-cloud/logging", "pino-http"]
const METRICS_LIBS = ["prom-client", "@opentelemetry", "metrics", "statsd-client", "express-prom-bundle", "@promster"]
const HEALTH_PATTERNS = [
  /\/healthz?(\/|"|'|`)/i,
  /\/ready(\/|"|'|`)/i,
  /\/live(\/|"|'|`)/i,
  /healthcheck/i,
  /liveness/i,
  /readiness/i,
  /checkHealth/i,
  /health\(/i,
]

const hasLogging = Object.keys(deps).some((d) => LOGGING_LIBS.some((l) => d === l || d.startsWith(`${l}/`)))
const hasMetrics = Object.keys(deps).some((d) => METRICS_LIBS.some((l) => d === l || d.startsWith(`${l}/`)))

// Indicadores de serviço (server/API) em um diretório
function hasServiceMarkers(dir: string): boolean {
  return existsSync(join(dir, "src", "server")) ||
    existsSync(join(dir, "src", "api")) ||
    existsSync(join(dir, "src", "index.ts")) ||
    existsSync(join(dir, "src", "index.js")) ||
    existsSync(join(dir, "server")) ||
    existsSync(join(dir, "app", "api"))
}

// Detecta se é serviço (tem server/API) — na raiz ou em packages/*, apps/*, services/*
const isService = Object.keys(deps).some((d) => /^(express|fastify|koa|hono|next|nuxt|nestjs|@hapi|http)/.test(d)) ||
  hasServiceMarkers(WORKSPACE) ||
  ["packages", "apps", "services"].some((sub) => {
    const dir = join(WORKSPACE, sub)
    if (!existsSync(dir)) return false
    return readdirSync(dir).some((entry) => {
      if (entry === "node_modules") return false
      const pkgDir = join(dir, entry)
      return statSync(pkgDir).isDirectory() && hasServiceMarkers(pkgDir)
    })
  })

function scanForHealth(dir: string, depth: number): boolean {
  if (depth > 4) return false
  let entries: string[] = []
  try {
    entries = execFileSync("ls", ["-A", dir], { encoding: "utf-8" }).split("\n").filter(Boolean)
  } catch {
    return false
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".git") continue
    const full = join(dir, entry)
    if (existsSync(full)) {
      const stat = execFileSync("stat", ["-c", "%F", full], { encoding: "utf-8" }).trim()
      if (stat === "directory") {
        if (scanForHealth(full, depth + 1)) return true
      } else if (/\.(ts|js|tsx|jsx)$/.test(entry) && !entry.includes(".test.")) {
        try {
          const content = readFileSync(full, "utf-8")
          if (HEALTH_PATTERNS.some((re) => re.test(content))) return true
        } catch {
          // skip unreadable
        }
      }
    }
  }
  return false
}

const hasHealthEndpoint = scanForHealth(WORKSPACE, 0)

const warnings: string[] = []
const problems: string[] = []

if (isService) {
  if (!hasHealthEndpoint) {
    problems.push("service without health check endpoint — add /health (or /healthz, /ready) so orchestrators can probe it")
  } else {
    console.log("observability: health check endpoint found")
  }
  if (!hasLogging) {
    warnings.push("no structured logging library (pino/winston/morgan) — logs should be machine-readable JSON")
  }
  if (!hasMetrics) {
    warnings.push("no metrics library (prom-client/@opentelemetry) — expose basic metrics when applicable")
  }
} else {
  if (!hasLogging) {
    warnings.push("no structured logging library — prefer structured logs over console.log in delivered code")
  }
}

// Logging estruturado no código (procura JSON.stringify em logs ou libs)
for (const w of warnings) console.log(`observability: WARN ${w}`)
for (const p of problems) console.log(`observability: FAIL ${p}`)

if (problems.length > 0) {
  console.log("observability: FAIL")
  process.exit(1)
}

if (isService) {
  console.log(`observability: PASS (${hasLogging ? "logging ✓" : "logging ✗"} / ${hasMetrics ? "metrics ✓" : "metrics ✗"} / health ✓)`)
} else {
  console.log(`observability: PASS (${hasLogging ? "logging ✓" : "logging ✗"})`)
}
process.exit(0)