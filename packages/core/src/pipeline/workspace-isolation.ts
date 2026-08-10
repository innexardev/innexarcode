export * as WorkspaceIsolation from "./workspace-isolation"

import { execFile } from "node:child_process"
import { mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

/**
 * Workspace Isolation — seção 13.1 do docs/melhorias-nivel-senior.md.
 *
 * Cada agente paralelo trabalha em um worktree git isolado, nunca no mesmo
 * diretório que outro agente ativo. Nenhum agente lê/escreve estado
 * compartilhado direto; cada execução paralela tem seu próprio working tree,
 * sincronizado apenas nos pontos de merge (via MergeCoordinator).
 */

export interface IsolationInfo {
  worktreePath: string
  branch: string
  base: string
}

function run(cmd: string, args: string[], cwd: string, timeout = 120_000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, timeout }, (error, stdout, stderr) => {
      const code = (error as { code?: number } | undefined)?.code ?? (error ? 1 : 0)
      resolve({ code, stdout: stdout || "", stderr: stderr || "" })
    })
  })
}

async function git(args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return run("git", args, cwd)
}

function hashBranch(branch: string): string {
  let h = 0
  for (let i = 0; i < branch.length; i++) {
    h = ((h << 5) - h + branch.charCodeAt(i)) | 0
  }
  return Math.abs(h).toString(36)
}

/**
 * Cria um worktree isolado para um agente.
 * - branch nova (ou reutiliza a existente se fornecida)
 * - base = branch atual do repo (geralmente dev/main)
 * - retorna o caminho do worktree (determinístico por branch)
 */
export async function createWorktree(input: {
  repoDir?: string
  agent: string
  base?: string
  /** branch existente para reutilizar (ex: retomada de tarefa) */
  branch?: string
}): Promise<IsolationInfo> {
  const repoDir = input.repoDir ?? process.cwd()
  const base = input.base ?? (await git(["branch", "--show-current"], repoDir)).stdout.trim()
  const safeAgent = input.agent.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40)
  const branch = input.branch ?? `agent-${safeAgent}-${Date.now().toString(36)}`
  const worktreePath = join(tmpdir(), "wt", `${safeAgent}-${hashBranch(branch)}`)
  await mkdir(join(tmpdir(), "wt"), { recursive: true })

  // verifica se a branch já existe (retomada de tarefa)
  const branchCheck = await git(["rev-parse", "--verify", "--quiet", branch], repoDir)
  if (branchCheck.code === 0) {
    const existing = await git(["worktree", "list", "--porcelain"], repoDir)
    const match = existing.stdout.split("\n\n").find((block) => block.includes(`branch refs/heads/${branch}`))
    if (match) {
      const pathLine = match.split("\n").find((l) => l.startsWith("worktree "))
      const existingPath = pathLine?.replace("worktree ", "").trim()
      if (existingPath) return { worktreePath: existingPath, branch, base }
    }
  }

  if (branchCheck.code !== 0) {
    const created = await git(["worktree", "add", "-b", branch, worktreePath, base], repoDir)
    if (created.code !== 0) {
      // branch pode ter sido criada por outro processo no meio-tempo
      const retry = await git(["worktree", "add", branch, worktreePath], repoDir)
      if (retry.code !== 0) throw new Error(`worktree add failed: ${created.stderr} / ${retry.stderr}`)
    }
  } else {
    const added = await git(["worktree", "add", worktreePath, branch], repoDir)
    if (added.code !== 0) throw new Error(`worktree add failed: ${added.stderr}`)
  }

  return { worktreePath, branch, base }
}

/**
 * Remove o worktree isolado (depois do merge validado).
 */
export async function removeWorktree(input: { repoDir?: string; branch: string }): Promise<void> {
  const repoDir = input.repoDir ?? process.cwd()
  const list = await git(["worktree", "list", "--porcelain"], repoDir)
  const block = list.stdout.split("\n\n").find((b) => b.includes(`branch refs/heads/${input.branch}`))
  if (!block) return
  const pathLine = block.split("\n").find((l) => l.startsWith("worktree "))
  const worktreePath = pathLine?.replace("worktree ", "").trim()
  if (!worktreePath) return
  await git(["worktree", "remove", "--force", worktreePath], repoDir)
  await git(["branch", "-D", input.branch], repoDir).catch(() => {})
  await rm(worktreePath, { recursive: true, force: true }).catch(() => {})
}