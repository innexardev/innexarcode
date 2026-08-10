/**
 * Infra cost gate — estimativa de custo de nuvem (template infra).
 *
 * Verifica:
 *  1. Terraform/IaC mudou no diff? (*.tf, *.tfvars, *.hcl, terragrunt.hcl)
 *  2. Se mudou e `infracost` instalado → roda e reporta estimativa
 *  3. Se mudou e infracost NÃO instalado → WARN (recomenda instalar)
 *  4. Sem mudança de IaC → not applicable
 *
 * Exit 0 sempre (WARN informativo — custo é decisão humana, não bloqueio).
 */
import { execFileSync, spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"

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
  console.log("infra-cost: no base branch — cannot detect IaC changes")
  console.log("infra-cost: PASS")
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

const iacFiles = [...new Set(out)].filter((f) => /\.(tf|tfvars|hcl)$/.test(f) && !f.includes("node_modules"))
if (iacFiles.length === 0) {
  console.log("infra-cost: not applicable (no Terraform/IaC change in diff)")
  console.log("infra-cost: PASS")
  process.exit(0)
}

console.log(`infra-cost: IaC changed (${iacFiles.length} files): ${iacFiles.slice(0, 5).join(", ")}`)

// infracost disponível?
const which = spawnSync("which", ["infracost"], { encoding: "utf-8" })
if (which.status === 0) {
  const result = spawnSync("infracost", ["breakdown", "--path", WORKSPACE, "--format", "json"], {
    encoding: "utf-8",
    timeout: 120_000,
    stdio: ["ignore", "pipe", "pipe"],
  })
  if (result.status === 0) {
    try {
      const report = JSON.parse(result.stdout)
      const projects = report.projects ?? []
      let monthly = 0
      for (const p of projects) {
        const breakdown = p.breakdown ?? {}
        monthly += breakdown.totalMonthlyCost ?? 0
      }
      console.log(`infra-cost: estimated monthly cost: $${Number(monthly).toFixed(2)}/month`)
      console.log("infra-cost: PASS")
      process.exit(0)
    } catch {
      console.log("infra-cost: WARN infracost ran but output could not be parsed")
    }
  } else {
    console.log(`infra-cost: WARN infracost failed: ${(result.stderr ?? "").slice(0, 200)}`)
  }
} else {
  console.log("infra-cost: WARN infracost not installed — install it (brew install infracost / curl -fsSL https://infracost.io/download) and set INFRACOST_API_KEY to estimate cloud cost before applying IaC")
  console.log("infra-cost: PASS (with warning)")
  process.exit(0)
}

console.log("infra-cost: PASS (with warning)")
process.exit(0)