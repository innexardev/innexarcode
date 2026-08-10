export * as Certification from "./certify"

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

/**
 * Specialist Certification — seção 11.8 do docs/melhorias-nivel-senior.md.
 *
 * Antes de confiar um especialista rodando sem supervisão, ele deve passar
 * por um benchmark próprio: tarefas curadas com resultado esperado. Isto
 * mede objetivamente se o "Security Specialist" é bom de verdade ou só tem
 * um prompt bonito.
 *
 * Cada tarefa é uma spec verificável no workspace (arquivos esperados,
 * padrões de código, gates). O relatório dá um score 0-100.
 */

export interface CertTask {
  id: string
  specialist: string
  name: string
  description: string
  /** arquivos que devem existir no workspace */
  requiredFiles: string[]
  /** padrões regex que devem aparecer (scan recursivo por extensão) */
  requiredPatterns: { pattern: RegExp; extensions: string[]; label: string }[]
  /** padrões PROIBIDOS (ex: console.log cru, secrets hardcoded) */
  forbiddenPatterns: { pattern: RegExp; extensions: string[]; label: string }[]
  /** extensões de arquivo para scan */
  scanExtensions: string[]
}

export interface CertCheckResult {
  task: string
  specialist: string
  pass: boolean
  detail: string[]
}

export interface CertificationReport {
  specialist: string
  name: string
  total: number
  passed: number
  failed: number
  score: number
  checks: CertCheckResult[]
  graded: "A" | "B" | "C" | "F"
}

export const SPECIALIST_CERTIFICATIONS: Record<string, { name: string; tasks: CertTask[] }> = {
  security: {
    name: "Security Specialist",
    tasks: [
      {
        id: "sec-no-secrets",
        specialist: "security",
        name: "No hardcoded secrets",
        description: "O código entregue não contém segredos hardcoded",
        requiredFiles: [],
        requiredPatterns: [],
        forbiddenPatterns: [
          { pattern: /(?:api[_-]?key|secret|token|password|passwd|private[_-]?key|auth[_-]?key)\s*[:=]\s*["'][^"']{8,}["']/i, extensions: [".ts", ".js", ".tsx", ".jsx", ".py", ".go"], label: "hardcoded secret" },
        ],
        scanExtensions: [".ts", ".js", ".tsx", ".jsx", ".py", ".go"],
      },
      {
        id: "sec-input-validation",
        specialist: "security",
        name: "Input validation at every boundary",
        description: "APIs validam entrada (schema/zod/class-validator) antes de processar",
        requiredFiles: [],
        requiredPatterns: [
          { pattern: /zod|class-validator|joi|yup|ajv|Schema\.|z\.object|zodSafeParse|validate\(/, extensions: [".ts", ".js"], label: "input validation library or schema" },
        ],
        forbiddenPatterns: [],
        scanExtensions: [".ts", ".js"],
      },
      {
        id: "sec-env-not-committed",
        specialist: "security",
        name: "Env vars used, not literals",
        description: "URLs/timeouts/chaves via process.env, nunca literais",
        requiredFiles: [".env.example"],
        requiredPatterns: [
          { pattern: /process\.env\.|Bun\.env\.|Deno\.env\./, extensions: [".ts", ".js", ".tsx", ".jsx"], label: "env var access" },
        ],
        forbiddenPatterns: [],
        scanExtensions: [".ts", ".js"],
      },
    ],
  },
  backend: {
    name: "Backend/API Specialist",
    tasks: [
      {
        id: "be-error-handling",
        specialist: "backend",
        name: "Error handling with typed errors",
        description: "Erros são tipados e tratados, não engolidos com try/catch vazio",
        requiredFiles: [],
        requiredPatterns: [
          { pattern: /catch\s*\([^)]*\)\s*\{[^}]*throw|TaggedError|HttpError|ErrorResponse|status\(\s*\d{3}\)/, extensions: [".ts", ".js"], label: "typed/structured error handling" },
        ],
        forbiddenPatterns: [
          { pattern: /catch\s*\([^)]*\)\s*\{\s*\}/, extensions: [".ts", ".js"], label: "empty catch (swallowed error)" },
        ],
        scanExtensions: [".ts", ".js"],
      },
      {
        id: "be-idempotency",
        specialist: "backend",
        name: "Idempotency for mutations",
        description: "POST/PUT idempotentes (idempotency key ou unique constraint)",
        requiredFiles: [],
        requiredPatterns: [
          { pattern: /idempoten|unique|ON CONFLICT|upsert|If-Match|Etag/, extensions: [".ts", ".js", ".sql"], label: "idempotency mechanism" },
        ],
        forbiddenPatterns: [],
        scanExtensions: [".ts", ".js", ".sql"],
      },
      {
        id: "be-api-contract",
        specialist: "backend",
        name: "API contract validation",
        description: "Schemas de entrada/saída definidos (zod/schema classes)",
        requiredFiles: [],
        requiredPatterns: [
          { pattern: /Schema\.|zod|z\.object|interface\s+\w+Dto|class-validator/, extensions: [".ts", ".js"], label: "contract schema" },
        ],
        forbiddenPatterns: [],
        scanExtensions: [".ts", ".js"],
      },
    ],
  },
  frontend: {
    name: "Frontend Specialist",
    tasks: [
      {
        id: "fe-loading-empty-error-states",
        specialist: "frontend",
        name: "Loading, empty and error states",
        description: "UI cobre loading/empty/error, não só o caminho feliz",
        requiredFiles: [],
        requiredPatterns: [
          { pattern: /loading|isLoading|pending|skeleton|spinner/, extensions: [".tsx", ".jsx", ".vue", ".svelte"], label: "loading state" },
          { pattern: /empty|noResults|notFound|noData/, extensions: [".tsx", ".jsx", ".vue", ".svelte"], label: "empty state" },
          { pattern: /error|onError|catch|failed|ErrorBoundary/, extensions: [".tsx", ".jsx", ".vue", ".svelte"], label: "error state" },
        ],
        forbiddenPatterns: [],
        scanExtensions: [".tsx", ".jsx", ".vue", ".svelte"],
      },
      {
        id: "fe-a11y-basics",
        specialist: "frontend",
        name: "Accessibility basics",
        description: "aria-labels em controles, alt em imagens, sem div onclick sem teclado",
        requiredFiles: [],
        requiredPatterns: [
          { pattern: /aria-label|aria-labelledby|role=|alt=|<label/, extensions: [".tsx", ".jsx", ".vue", ".svelte"], label: "a11y attributes" },
        ],
        forbiddenPatterns: [
          { pattern: /<div[^>]*onClick[^>]*>\s*[^<]*<\/div>/, extensions: [".tsx", ".jsx"], label: "non-keyboard clickable div" },
        ],
        scanExtensions: [".tsx", ".jsx", ".vue", ".svelte"],
      },
    ],
  },
  database: {
    name: "Database Specialist",
    tasks: [
      {
        id: "db-indexes",
        specialist: "database",
        name: "Indexes on queried columns",
        description: "Migrations criam índices para colunas consultadas",
        requiredFiles: [],
        requiredPatterns: [
          { pattern: /index|CREATE INDEX|\.index\(|@Index/, extensions: [".sql", ".ts"], label: "index definition" },
        ],
        forbiddenPatterns: [],
        scanExtensions: [".sql", ".ts"],
      },
      {
        id: "db-safe-migrations",
        specialist: "database",
        name: "No destructive migrations without backup",
        description: "Sem DROP TABLE/COLUMN em migration sem nota de rollback",
        requiredFiles: [],
        requiredPatterns: [],
        forbiddenPatterns: [
          { pattern: /DROP TABLE|DROP COLUMN/, extensions: [".sql", ".ts"], label: "destructive migration" },
        ],
        scanExtensions: [".sql", ".ts"],
      },
    ],
  },
  infra: {
    name: "DevOps/Infra Specialist",
    tasks: [
      {
        id: "infra-healthcheck",
        specialist: "infra",
        name: "Health checks in containers",
        description: "Dockerfile/compose/k8s definem healthcheck",
        requiredFiles: [],
        requiredPatterns: [
          { pattern: /healthcheck|HEALTHCHECK|livenessProbe|readinessProbe/, extensions: [".yml", ".yaml", "Dockerfile"], label: "healthcheck config" },
        ],
        forbiddenPatterns: [],
        scanExtensions: [".yml", ".yaml"],
      },
      {
        id: "infra-pinned-images",
        specialist: "infra",
        name: "Pinned container versions",
        description: "Imagens com tag específica, não 'latest'",
        requiredFiles: [],
        requiredPatterns: [],
        forbiddenPatterns: [
          { pattern: /image:\s*[^#\s]+:latest/, extensions: [".yml", ".yaml"], label: "latest image tag" },
        ],
        scanExtensions: [".yml", ".yaml"],
      },
    ],
  },
  "qa-test": {
    name: "QA/Test Specialist",
    tasks: [
      {
        id: "qa-edge-cases",
        specialist: "qa-test",
        name: "Edge case tests",
        description: "Testes cobrem inputs inválidos, timeouts, estados vazios",
        requiredFiles: [],
        requiredPatterns: [
          { pattern: /empty|invalid|edge|timeout|error|throws?\(|rejects?\(|nan|undefined|null/, extensions: [".test.ts", ".spec.ts", ".test.js", ".spec.js"], label: "edge case test" },
        ],
        forbiddenPatterns: [],
        scanExtensions: [".test.ts", ".spec.ts", ".test.js", ".spec.js", ".ts", ".js"],
      },
    ],
  },
  "ux-writing": {
    name: "UX Writing Specialist",
    tasks: [
      {
        id: "ux-no-tech-jargon",
        specialist: "ux-writing",
        name: "User-facing copy is clear",
        description: "Mensagens de erro explicam o que aconteceu e o que fazer",
        requiredFiles: [],
        requiredPatterns: [
          { pattern: /tente novamente|try again|o que|como|instru|entre em contato|contact/, extensions: [".tsx", ".jsx", ".md"], label: "actionable user copy" },
        ],
        forbiddenPatterns: [],
        scanExtensions: [".tsx", ".jsx", ".md"],
      },
    ],
  },
}

function walkFiles(dir: string, extensions: string[], depth: number, out: string[]): void {
  if (depth > 5) return
  let entries: string[] = []
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".git" || name.startsWith(".")) continue
    const full = join(dir, name)
    let isDir = false
    try {
      isDir = statSync(full).isDirectory()
    } catch {
      continue
    }
    if (isDir) {
      walkFiles(full, extensions, depth + 1, out)
    } else if (extensions.some((ext) => name.endsWith(ext))) {
      out.push(full)
    }
  }
}

function fileMatches(file: string, extensions: string[]): boolean {
  return extensions.some((ext) => file.endsWith(ext) || file.includes(ext))
}

export function runCertification(specialist: string, workspace: string): CertificationReport {
  const cert = SPECIALIST_CERTIFICATIONS[specialist]
  if (!cert) {
    return {
      specialist,
      name: "Unknown specialist",
      total: 0,
      passed: 0,
      failed: 0,
      score: 0,
      checks: [],
      graded: "F",
    }
  }

  const checks: CertCheckResult[] = []
  let passed = 0
  let failed = 0

  for (const task of cert.tasks) {
    const details: string[] = []
    let taskPass = true

    // arquivos requeridos
    for (const rf of task.requiredFiles) {
      if (existsSync(join(workspace, rf))) {
        details.push(`✓ file ${rf} present`)
      } else {
        details.push(`✗ file ${rf} MISSING`)
        taskPass = false
      }
    }

    // coleta arquivos relevantes
    const allFiles: string[] = []
    walkFiles(workspace, task.scanExtensions, 0, allFiles)

    // padrões requeridos (pelo menos UM match por padrão)
    for (const req of task.requiredPatterns) {
      const match = allFiles.some((f) => fileMatches(f, req.extensions) ? req.pattern.test(readSafe(f)) : false)
      if (match) {
        details.push(`✓ ${req.label}`)
      } else {
        details.push(`✗ ${req.label} NOT FOUND`)
        taskPass = false
      }
    }

    // padrões proibidos
    for (const forb of task.forbiddenPatterns) {
      const offenders = allFiles.filter((f) => fileMatches(f, forb.extensions) ? forb.pattern.test(readSafe(f)) : false)
      if (offenders.length > 0) {
        details.push(`✗ ${forb.label} FOUND in ${offenders.slice(0, 2).map((f) => f.split("/").pop()).join(", ")}`)
        taskPass = false
      } else {
        details.push(`✓ no ${forb.label}`)
      }
    }

    if (taskPass) passed += 1
    else failed += 1
    checks.push({ task: task.name, specialist: task.specialist, pass: taskPass, detail: details })
  }

  const total = checks.length
  const score = total === 0 ? 0 : Math.round((passed / total) * 100)
  const graded: CertificationReport["graded"] = score >= 90 ? "A" : score >= 75 ? "B" : score >= 50 ? "C" : "F"

  return { specialist, name: cert.name, total, passed, failed, score, checks, graded }
}

function readSafe(file: string): string {
  try {
    return readFileSync(file, "utf-8")
  } catch {
    return ""
  }
}

export function formatCertification(report: CertificationReport): string {
  const lines: string[] = []
  lines.push(`Certification: ${report.name} (${report.specialist})`)
  lines.push(`Grade: ${report.graded} — Score: ${report.score}/100 (${report.passed}/${report.total} tasks passed)`)
  for (const check of report.checks) {
    lines.push(`${check.pass ? "✓" : "✗"} ${check.task}`)
    for (const d of check.detail) lines.push(`    ${d}`)
  }
  return lines.join("\n")
}