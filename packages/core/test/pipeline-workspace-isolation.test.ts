import { describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { WorkspaceIsolation } from "@opencode-ai/core/pipeline"

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "wt-isol-test-"))
  const git = (args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] })
  git(["init", "-q", "-b", "main"])
  git(["config", "user.email", "t@t"])
  git(["config", "user.name", "t"])
  writeFileSync(join(dir, "a.txt"), "base\n")
  git(["add", "."])
  git(["commit", "-qm", "base"])
  return dir
}

describe("WorkspaceIsolation", () => {
  test("creates isolated worktree with agent branch", async () => {
    const dir = makeRepo()
    const info = await WorkspaceIsolation.createWorktree({ repoDir: dir, agent: "frontend-agent", base: "main" })
    expect(existsSync(info.worktreePath)).toBe(true)
    expect(info.branch).toContain("agent-frontend-agent")
    expect(info.base).toBe("main")
    // worktree está em branch própria, main intacta
    const branch = execFileSync("git", ["branch", "--show-current"], { cwd: info.worktreePath, encoding: "utf-8" }).trim()
    expect(branch).toBe(info.branch)
    const mainBranch = execFileSync("git", ["branch", "--show-current"], { cwd: dir, encoding: "utf-8" }).trim()
    expect(mainBranch).toBe("main")
  })

  test("worktree edits do not affect the main repo", async () => {
    const dir = makeRepo()
    const info = await WorkspaceIsolation.createWorktree({ repoDir: dir, agent: "backend", base: "main" })
    writeFileSync(join(info.worktreePath, "b.txt"), "work in branch\n")
    execFileSync("git", ["add", "."], { cwd: info.worktreePath })
    execFileSync("git", ["commit", "-qm", "agent work"], { cwd: info.worktreePath })
    // main não tem o arquivo
    expect(existsSync(join(dir, "b.txt"))).toBe(false)
  })

  test("removes worktree and branch after merge", async () => {
    const dir = makeRepo()
    const info = await WorkspaceIsolation.createWorktree({ repoDir: dir, agent: "qa", base: "main" })
    expect(existsSync(info.worktreePath)).toBe(true)
    await WorkspaceIsolation.removeWorktree({ repoDir: dir, branch: info.branch })
    expect(existsSync(info.worktreePath)).toBe(false)
  })

  test("reuses existing branch worktree on resume", async () => {
    const dir = makeRepo()
    const first = await WorkspaceIsolation.createWorktree({ repoDir: dir, agent: "data", base: "main" })
    const second = await WorkspaceIsolation.createWorktree({ repoDir: dir, agent: "data", base: "main", branch: first.branch })
    expect(second.worktreePath).toBe(first.worktreePath)
    await WorkspaceIsolation.removeWorktree({ repoDir: dir, branch: first.branch })
  })
})