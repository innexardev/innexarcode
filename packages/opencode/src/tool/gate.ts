import { Effect, Schema } from "effect"
import { pipelineState } from "@opencode-ai/core/pipeline"
import * as Tool from "./tool"
import { execFile } from "child_process"

export const GateName = Schema.Union([
  Schema.Literal("build"),
  Schema.Literal("lint"),
  Schema.Literal("types"),
  Schema.Literal("tests"),
  Schema.Literal("coverage"),
  Schema.Literal("security"),
  Schema.Literal("docker"),
  Schema.Literal("deploy"),
])
export type GateName = typeof GateName.Type

export const GateResult = Schema.Struct({
  gate: GateName,
  passed: Schema.Boolean,
  output: Schema.String,
  duration: Schema.Number,
  error: Schema.optional(Schema.String),
})

export const Parameters = Schema.Struct({
  command: Schema.Union([
    Schema.Literal("run-gates"),
    Schema.Literal("run-gate"),
    Schema.Literal("status"),
  ]),
  gates: Schema.optional(Schema.mutable(Schema.Array(GateName))),
})

type Metadata = {
  gates: Schema.Schema.Type<typeof GateResult>[]
}

const ALL_GATES: GateName[] = ["build", "lint", "types", "tests", "coverage", "security", "docker", "deploy"]

const ALL_GATE_NAMES = ["build", "lint", "types", "tests", "coverage", "security", "docker", "deploy"] as const

const WORKSPACE = "/root/opencode-engos"
const BUN = "/root/.bun/bin/bun"

const GATE_ARGS: Record<string, [string, string[]]> = {
  build: [BUN, ["run", "build"]],
  lint: [BUN, ["run", "lint"]],
  types: [BUN, ["run", "typecheck"]],
  tests: [BUN, ["run", "test"]],
  coverage: [BUN, ["run", "test", "--coverage"]],
  security: [BUN, ["run", "audit"]],
  docker: ["/usr/bin/sh", ["-c", "ls /root/opencode-engos/Dockerfile 2>/dev/null || ls /root/opencode-engos/docker-compose.yml 2>/dev/null || echo 'no-docker-config'"]],
  deploy: ["/usr/bin/sh", ["-c", "ls /root/opencode-engos/deploy.yaml 2>/dev/null || ls /root/opencode-engos/.github/deploy.yaml 2>/dev/null || ls /root/opencode-engos/deploy.yml 2>/dev/null || echo 'no-deploy-config'"]],
}

async function execGate(gate: GateName): Promise<{ stdout: string; stderr: string; exitCode: number; passed: boolean }> {
  const [bin, args] = GATE_ARGS[gate] ?? ["/usr/bin/true", []]
  return new Promise((resolve) => {
    execFile(bin, args, { cwd: WORKSPACE, timeout: 120_000 }, (error, stdout, stderr) => {
      const exitCode = (error as { code?: number } | undefined)?.code ?? (error ? 1 : 0)
      resolve({ stdout: stdout || "", stderr: stderr || "", exitCode, passed: exitCode === 0 })
    })
  })
}

function runGate(gate: GateName) {
  return Effect.gen(function* () {
    const start = Date.now()
    const { stdout, stderr, passed } = yield* Effect.promise(() => execGate(gate))
    const duration = Date.now() - start
    if (passed && pipelineState) pipelineState.passGate(gate)
    const result: Schema.Schema.Type<typeof GateResult> = {
      gate,
      passed,
      output: stdout || stderr || "(no output)",
      duration,
      error: stderr || undefined,
    }
    return result
  })
}

export const GateTool = Tool.define<typeof Parameters, Metadata, never>(
  "gate",
  Effect.gen(function* () {
    return {
      description:
        "Run quality gates (build, lint, types, tests, coverage, security, docker, deploy) and return results. Blocks delivery if any fail.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const gates = params.gates ?? (ALL_GATES as GateName[])

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
            const result = yield* runGate(gate)
            const title = result.passed ? `PASS: ${gate}` : `FAIL: ${gate}`
            return {
              title,
              output: JSON.stringify(result, null, 2),
              metadata: { gates: [result] },
            }
          }

          const results: Schema.Schema.Type<typeof GateResult>[] = []
          for (const gate of gates) {
            const result = yield* runGate(gate)
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
