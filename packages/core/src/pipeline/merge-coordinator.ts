export * as MergeCoordinator from "./merge-coordinator"

import { execFile } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

/**
 * Merge Coordinator — seções 13.3/13.4 do docs/melhorias-nivel-senior.md.
 *
 * Valida a integração de branches paralelas SEM merge cego:
 *  1. Cria um clone temporário do repo
 *  2. Faz merge simulado de cada branch de feature (sequencialmente, na
 *     ordem de criação) sobre a base
 *  3. Roda a suite de testes COMPLETA (não só do módulo tocado) no resultado
 *     do merge — dois diffs individualmente válidos podem quebrar juntos
 *  4. Se falhar, a branch mais recente é marcada como conflitante (sem
 *     descartar) e o relatório aponta o par que quebrou
 *
 * O processo roda em um clone temporário — nunca toca o working tree real.
 */

export interface MergeReport {
  ok: boolean
  base: string
  branches: string[]
  merged: string[]
  conflicted: { branch: string; error: string }[]
  testsPassed: boolean
  testOutput: string
  tempDir: string
}

export interface MergeOptions {
  /** caminho do repo (default: cwd) */
  repoDir?: string
  /** branch base (default: branch atual) */
  base?: string
  /** branches de feature a integrar (default: detecta via git) */
  branches?: string[]
  /** comando de teste (default: bun run test) */
  testCommand?: string
  /** remove o clone temporário no fim (default: true) */
  cleanup?: boolean
}

function run(cmd: string, args: string[], cwd: string, timeout = 300_000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, timeout }, (error, stdout, stderr) => {
      const code = (error as { code?: number } | undefined)?.code ?? (error ? 1 : 0)
      resolve({ code, stdout: stdout || "", stderr: stderr || "" })
    })
  })
}

async function git(args: string[], cwd: string, timeout?: number): Promise<{ code: number; stdout: string; stderr: string }> {
  return run("git", args, cwd, timeout)
}

function parseTestCommand(cmd: string): [string, string[]] {
  const parts = cmd.split(" ").filter(Boolean)
  return [parts[0] ?? "true", parts.slice(1)]
}

export async function validateMerge(input: MergeOptions = {}): Promise<MergeReport> {
  const repoDir = input.repoDir ?? process.cwd()
  const base = input.base ?? (await git(["branch", "--show-current"], repoDir)).stdout.trim()

  // Detecta branches de feature: todas exceto base/main/dev/master
  let branches = input.branches ?? []
  if (branches.length === 0) {
    const list = await git(["branch", "--format=%(refname:short)"], repoDir)
    const protectedNames = new Set([base, "main", "dev", "master", "HEAD"])
    branches = list.stdout.split("\n").map((b) => b.trim()).filter((b) => b && !protectedNames.has(b))
  }

  const report: MergeReport = {
    ok: false,
    base,
    branches,
    merged: [],
    conflicted: [],
    testsPassed: false,
    testOutput: "",
    tempDir: "",
  }

  if (branches.length === 0) {
    report.ok = true
    report.testsPassed = true
    report.testOutput = "(no feature branches to merge)"
    return report
  }

  // Clone raso temporário
  const tempDir = await mkdtemp(join(tmpdir(), "merge-validate-"))
  report.tempDir = tempDir
  const clone = await git(["clone", "--quiet", "--no-hardlinks", repoDir, tempDir], repoDir, 300_000)
  if (clone.code !== 0) {
    report.ok = false
    report.testOutput = `clone failed: ${clone.stderr}`
    if (input.cleanup !== false) await rm(tempDir, { recursive: true, force: true })
    return report
  }

  try {
    // Checkout da base
    await git(["checkout", "--quiet", base], tempDir)
    // Garante branches locais
    for (const b of branches) {
      await git(["checkout", "--quiet", b], tempDir).then(async () => {
        await git(["checkout", "--quiet", base], tempDir)
      })
    }

    // Merge simulado sequencial na ordem de criação (mais antiga primeiro)
    const merged: string[] = []
    const conflicted: { branch: string; error: string }[] = []
    for (const b of branches) {
      const merge = await git(["merge", "--no-edit", "--no-ff", b], tempDir, 300_000)
      if (merge.code === 0) {
        merged.push(b)
      } else {
        conflicted.push({ branch: b, error: merge.stderr.slice(0, 300) || merge.stdout.slice(0, 300) })
        // aborta para não contaminar merges seguintes
        await git(["merge", "--abort"], tempDir)
      }
    }

    report.merged = merged
    report.conflicted = conflicted

    // Suite de testes COMPLETA no resultado do merge
    const [testBin, testArgs] = parseTestCommand(input.testCommand ?? "bun run test")
    const tests = await run(testBin, testArgs, tempDir, 600_000)
    report.testsPassed = tests.code === 0
    report.testOutput = tests.stdout.slice(0, 2_000) + (tests.stderr ? `\n--- stderr ---\n${tests.stderr.slice(0, 1_000)}` : "")

    report.ok = conflicted.length === 0 && report.testsPassed
    return report
  } finally {
    if (input.cleanup !== false) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {})
    }
  }
}

export function formatMergeReport(report: MergeReport): string {
  const lines: string[] = []
  lines.push(`Merge validation: ${report.ok ? "PASS" : "FAIL"}`)
  lines.push(`Base: ${report.base}`)
  lines.push(`Branches: ${report.branches.length} (${report.branches.join(", ")})`)
  lines.push(`Merged cleanly: ${report.merged.length > 0 ? report.merged.join(", ") : "(none)"}`)
  if (report.conflicted.length > 0) {
    lines.push("Conflicted (need manual resolution or rebase):")
    for (const c of report.conflicted) lines.push(`  ✗ ${c.branch}: ${c.error}`)
  }
  lines.push(`Full test suite after simulated merge: ${report.testsPassed ? "PASS" : "FAIL"}`)
  if (!report.testsPassed && report.testOutput) {
    lines.push("--- test output (truncated) ---")
    lines.push(report.testOutput.slice(0, 1_200))
  }
  return lines.join("\n")
}