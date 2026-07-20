import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

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

const GATE_COMMANDS: Record<string, string> = {
  build: "bun run build",
  lint: "bun run lint",
  types: "bun typecheck",
  tests: "bun test",
  coverage: "bun test --coverage",
  security: "bun audit",
  docker: "ls Dockerfile 2>/dev/null || ls docker-compose.yml 2>/dev/null || echo 'no-docker-config'",
  deploy: "ls deploy.yaml 2>/dev/null || ls .github/deploy.yaml 2>/dev/null || ls deploy.yml 2>/dev/null || echo 'no-deploy-config'",
}

async function execGate(gate: GateName) {
  const cmd = GATE_COMMANDS[gate]
  try {
    const { stdout, stderr } = await execAsync(cmd)
    return { stdout, stderr, passed: !stderr }
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; message?: string }
    return {
      stdout: err.stdout || "",
      stderr: err.stderr || err.message || String(error),
      passed: false,
    }
  }
}

function runGate(gate: GateName) {
  return Effect.gen(function* () {
    const start = Date.now()
    const { stdout, stderr, passed } = yield* Effect.promise(() => execGate(gate))
    const duration = Date.now() - start
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
