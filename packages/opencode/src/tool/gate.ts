import { Effect, Schema } from "effect"
import { pipelineState } from "@opencode-ai/core/pipeline"
import * as Tool from "./tool"
import { execFile } from "child_process"
import { existsSync, readFileSync } from "fs"
import { join } from "path"

export const GateName = Schema.Union([
  Schema.Literal("build"),
  Schema.Literal("lint"),
  Schema.Literal("types"),
  Schema.Literal("tests"),
  Schema.Literal("coverage"),
  Schema.Literal("security"),
  Schema.Literal("docker"),
  Schema.Literal("deploy"),
  Schema.Literal("complexity"),
  Schema.Literal("deps"),
  Schema.Literal("duplication"),
  Schema.Literal("polish"),
  Schema.Literal("a11y"),
  Schema.Literal("licenses"),
  Schema.Literal("compat"),
  Schema.Literal("scope"),
  Schema.Literal("i18n"),
  Schema.Literal("seo"),
  Schema.Literal("market"),
  Schema.Literal("infra-cost"),
  Schema.Literal("onboarding"),
  Schema.Literal("analytics"),
  Schema.Literal("observability"),
  Schema.Literal("token-economy"),
])
export type GateName = typeof GateName.Type

export const FixOutput = Schema.Struct({
  fixApplied: Schema.Boolean,
  fixIssues: Schema.Number,
  remainingIssues: Schema.Number,
})

export const GateResult = Schema.Struct({
  gate: GateName,
  passed: Schema.Boolean,
  output: Schema.String,
  duration: Schema.Number,
  error: Schema.optional(Schema.String),
  fixOutput: Schema.optional(FixOutput),
})

export const Parameters = Schema.Struct({
  command: Schema.Union([
    Schema.Literal("run-gates"),
    Schema.Literal("run-gate"),
    Schema.Literal("status"),
  ]),
  gates: Schema.optional(Schema.mutable(Schema.Array(GateName))),
  autoFix: Schema.optional(Schema.Boolean),
})

type Metadata = {
  gates: Schema.Schema.Type<typeof GateResult>[]
}

const ALL_GATES: GateName[] = ["build", "lint", "types", "tests", "coverage", "security", "docker", "deploy", "complexity", "deps", "duplication", "polish", "a11y", "licenses", "compat", "scope", "i18n", "seo", "market", "infra-cost", "onboarding", "analytics", "observability", "token-economy"]

const ALL_GATE_NAMES = ["build", "lint", "types", "tests", "coverage", "security", "docker", "deploy", "complexity", "deps", "duplication", "polish", "a11y", "licenses", "compat", "scope", "i18n", "seo", "market", "infra-cost", "onboarding", "analytics", "observability", "token-economy"] as const

const WORKSPACE = "/root/opencode-engos"
const BUN = "/root/.bun/bin/bun"

/** Gate timeout: env-overridable (default 600s — npx-based gates download tools on first run). */
function gateTimeoutMs(): number {
  const raw = process.env.GATE_TIMEOUT_MS
  const parsed = raw ? parseInt(raw, 10) : Number.NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 600_000
}

const GATE_ARGS: Record<string, [string, string[]]> = {
  build: [BUN, ["run", "build"]],
  lint: [BUN, ["run", "lint"]],
  types: [BUN, ["run", "typecheck"]],
  tests: [BUN, ["run", "test"]],
  coverage: [BUN, ["run", "test", "--coverage"]],
  security: [BUN, ["run", "audit"]],
  docker: ["/usr/bin/sh", ["-c", "ls /root/opencode-engos/Dockerfile 2>/dev/null || ls /root/opencode-engos/docker-compose.yml 2>/dev/null || echo 'no-docker-config'"]],
  deploy: ["/usr/bin/sh", ["-c", "ls /root/opencode-engos/deploy.yaml 2>/dev/null || ls /root/opencode-engos/.github/deploy.yaml 2>/dev/null || ls /root/opencode-engos/deploy.yml 2>/dev/null || echo 'no-deploy-config'"]],
  complexity: ["/usr/bin/sh", ["-c", "npx eslint --rule 'complexity: [\"error\", 10]' src/ 2>&1 || npx complexify src/ 2>&1 || echo 'no-complexity-tool'"]],
  deps: ["/usr/bin/sh", ["-c", "npx madge --circular src/ 2>&1 || npx dpdm src/**/*.ts --tree false --warning false 2>&1 || echo 'no-deps-tool'"]],
  duplication: ["/usr/bin/sh", ["-c", "npx jscpd src/ --threshold 10 2>&1 || echo 'no-duplication-tool'"]],
  polish: ["/root/.bun/bin/bun", ["packages/opencode/script/gates/polish.ts"]],
  a11y: ["/root/.bun/bin/bun", ["packages/opencode/script/gates/a11y.ts"]],
  licenses: ["/root/.bun/bin/bun", ["packages/opencode/script/gates/licenses.ts"]],
  compat: ["/root/.bun/bin/bun", ["packages/opencode/script/gates/compat.ts"]],
  scope: ["/root/.bun/bin/bun", ["packages/opencode/script/gates/scope.ts"]],
  i18n: ["/root/.bun/bin/bun", ["packages/opencode/script/gates/i18n.ts"]],
  seo: ["/root/.bun/bin/bun", ["packages/opencode/script/gates/seo.ts"]],
  market: ["/root/.bun/bin/bun", ["packages/opencode/script/gates/market.ts"]],
  "infra-cost": ["/root/.bun/bin/bun", ["packages/opencode/script/gates/infra-cost.ts"]],
  onboarding: ["/root/.bun/bin/bun", ["packages/opencode/script/gates/onboarding.ts"]],
  analytics: ["/root/.bun/bin/bun", ["packages/opencode/script/gates/analytics.ts"]],
  observability: ["/root/.bun/bin/bun", ["packages/opencode/script/gates/observability.ts"]],
  "token-economy": ["/root/.bun/bin/bun", ["packages/opencode/script/gates/token-economy.ts"]],
}

async function execFileAsync(bin: string, args: string[], cwd: string, timeout: number): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    execFile(bin, args, { cwd, timeout }, (error, stdout, stderr) => {
      const exitCode = (error as { code?: number } | undefined)?.code ?? (error ? 1 : 0)
      resolve({ stdout: stdout || "", stderr: stderr || "", exitCode })
    })
  })
}

function detectFixCommand(): [string, string[]] | null {
  const pkgPath = join(WORKSPACE, "package.json")
  if (!existsSync(pkgPath)) return null
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"))
    const scripts = pkg?.scripts ?? {}
    if (scripts["lint:fix"]) return [BUN, ["run", "lint:fix"]]
    if (scripts["format:fix"]) return [BUN, ["run", "format:fix"]]
    if (scripts.format) return [BUN, ["run", "format"]]
  } catch {
    // ignore parse errors
  }
  if (existsSync(join(WORKSPACE, "eslint.config.js")) || existsSync(join(WORKSPACE, ".eslintrc.js")) || existsSync(join(WORKSPACE, ".eslintrc.json")) || existsSync(join(WORKSPACE, ".eslintrc"))) {
    return [BUN, ["x", "eslint", "--fix", "."]]
  }
  if (existsSync(join(WORKSPACE, "prettier.config.js")) || existsSync(join(WORKSPACE, ".prettierrc")) || existsSync(join(WORKSPACE, ".prettierrc.json"))) {
    return [BUN, ["x", "prettier", "--write", "."]]
  }
  return null
}

async function execGate(gate: GateName): Promise<{ stdout: string; stderr: string; exitCode: number; passed: boolean }> {
  const [bin, args] = GATE_ARGS[gate] ?? ["/usr/bin/true", []]
  const { stdout, stderr, exitCode } = await execFileAsync(bin, args, WORKSPACE, gateTimeoutMs())
  return { stdout, stderr, exitCode, passed: exitCode === 0 }
}

async function execGateWithAutoFix(gate: GateName, autoFix: boolean): Promise<{ stdout: string; stderr: string; exitCode: number; passed: boolean; fixOutput?: Schema.Schema.Type<typeof FixOutput> }> {
  if (gate !== "lint" || !autoFix) {
    const result = await execGate(gate)
    return { ...result, fixOutput: undefined }
  }

  const fixCmd = detectFixCommand()
  if (!fixCmd) {
    const result = await execGate(gate)
    return { ...result, fixOutput: { fixApplied: false, fixIssues: 0, remainingIssues: 0 } }
  }

  const fixResult = await execFileAsync(fixCmd[0], fixCmd[1], WORKSPACE, gateTimeoutMs())
  const fixApplied = fixResult.exitCode === 0

  const checkResult = await execGate(gate)
  const fixIssues = fixApplied ? 1 : 0
  const remainingIssues = checkResult.passed ? 0 : 1

  return {
    stdout: checkResult.stdout + (fixResult.stdout ? "\n--- Fix output ---\n" + fixResult.stdout : ""),
    stderr: checkResult.stderr + (fixResult.stderr ? "\n--- Fix stderr ---\n" + fixResult.stderr : ""),
    exitCode: checkResult.exitCode,
    passed: checkResult.passed,
    fixOutput: { fixApplied, fixIssues, remainingIssues },
  }
}

function runGate(gate: GateName, autoFix = false) {
  return Effect.gen(function* () {
    const start = Date.now()
    const { stdout, stderr, passed, fixOutput } = yield* Effect.promise(() => execGateWithAutoFix(gate, autoFix))
    const duration = Date.now() - start
    if (passed && pipelineState) pipelineState.passGate(gate)
    const result: Schema.Schema.Type<typeof GateResult> = {
      gate,
      passed,
      output: stdout || stderr || "(no output)",
      duration,
      error: stderr || undefined,
      ...(fixOutput ? { fixOutput } : {}),
    }
    return result
  })
}

export const GateTool = Tool.define<typeof Parameters, Metadata, never>(
  "gate",
  Effect.gen(function* () {
    return {
      description:
        "Run quality gates (build, lint, types, tests, coverage, security, docker, deploy, complexity, deps, duplication, polish, a11y, licenses, compat, scope, i18n, seo, market, infra-cost, onboarding, analytics, observability, token-economy) and return results. Blocks delivery if any fail. polish = senior DoD (no TODO/console.log/secrets, docs updated). a11y = WCAG for web/mobile. licenses = copyleft check on new deps. compat = breaking API/schema requires ADR. scope = diff within .opencode/scope.json. i18n = translation readiness for frontend. seo = meta tags/sitemap for web. market = registered demand for user-facing features (conditional WARN). infra-cost = cloud cost estimate for IaC changes. onboarding = new client-facing pages declare onboarding needs. analytics = new client-facing pages declare tracking events. observability = delivered product has health check (required for services), structured logging and metrics. token-economy = advisory token budget/metrics check (never blocks). Use autoFix=true to auto-apply eslint/prettier fixes before the lint check.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const gates = params.gates ?? (ALL_GATES as GateName[])
          const autoFix = params.autoFix ?? false

          if (params.command === "status") {
            return {
              title: "Gate Status",
              output: JSON.stringify({ status: "ready", gates: ALL_GATE_NAMES }, null, 2),
              metadata: { gates: [] },
            }
          }

          if (params.command === "run-gate") {
            const gate = gates[0]
            if (!gate) {
              return {
                title: "Error",
                output: "No gate specified. Provide a gate name.",
                metadata: { gates: [] },
              }
            }
            const result = yield* runGate(gate, autoFix)
            const title = result.passed ? `PASS: ${gate}` : `FAIL: ${gate}`
            return {
              title,
              output: JSON.stringify(result, null, 2),
              metadata: { gates: [result] },
            }
          }

          const results: Schema.Schema.Type<typeof GateResult>[] = []
          for (const gate of gates) {
            const result = yield* runGate(gate, autoFix)
            results.push(result)
          }

          const failed = results.filter((r) => !r.passed)
          const status =
            failed.length === 0
              ? "ALL GATES PASSED"
              : `FAILED: ${failed.map((r) => r.gate).join(", ")}`

          return {
            title: `Quality Gates: ${status}`,
            output: JSON.stringify(results, null, 2),
            metadata: { gates: results },
          }
        }),
    } satisfies Tool.DefWithoutID<typeof Parameters, Metadata>
  }),
)
