import { describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MergeCoordinator } from "@opencode-ai/core/pipeline"

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "merge-coord-test-"))
  const git = (args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] })
  git(["init", "-q", "-b", "main"])
  git(["config", "user.email", "t@t"])
  git(["config", "user.name", "t"])
  writeFileSync(join(dir, "a.txt"), "base\n")
  git(["add", "."])
  git(["commit", "-qm", "base"])
  return dir
}

describe("MergeCoordinator", () => {
  test("validates clean merge with passing tests", async () => {
    const dir = makeRepo()
    const git = (args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] })
    // branch 1
    git(["checkout", "-qb", "feat-a"])
    writeFileSync(join(dir, "b.txt"), "b\n")
    git(["add", "."])
    git(["commit", "-qm", "feat-a"])
    // branch 2 (from main)
    git(["checkout", "-q", "main"])
    git(["checkout", "-qb", "feat-b"])
    writeFileSync(join(dir, "c.txt"), "c\n")
    git(["add", "."])
    git(["commit", "-qm", "feat-b"])

    const report = await MergeCoordinator.validateMerge({
      repoDir: dir,
      base: "main",
      testCommand: "true", // no real tests in fixture — command must succeed
    })
    expect(report.ok).toBe(true)
    expect(report.merged).toEqual(expect.arrayContaining(["feat-a", "feat-b"]))
    expect(report.conflicted).toEqual([])
    expect(report.testsPassed).toBe(true)
  })

  test("reports conflicted branches without discarding them", async () => {
    const dir = makeRepo()
    const git = (args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] })
    // ambas branches editam o MESMO arquivo na mesma linha → conflito
    git(["checkout", "-qb", "feat-a"])
    writeFileSync(join(dir, "a.txt"), "from a\n")
    git(["add", "."])
    git(["commit", "-qm", "feat-a"])
    git(["checkout", "-q", "main"])
    git(["checkout", "-qb", "feat-b"])
    writeFileSync(join(dir, "a.txt"), "from b\n")
    git(["add", "."])
    git(["commit", "-qm", "feat-b"])

    const report = await MergeCoordinator.validateMerge({
      repoDir: dir,
      base: "main",
      testCommand: "true",
    })
    expect(report.ok).toBe(false)
    // uma das branches mergeia, a outra conflita (ou as duas conflitam)
    expect(report.conflicted.length).toBeGreaterThan(0)
  })

  test("fails when full test suite breaks after simulated merge", async () => {
    const dir = makeRepo()
    const git = (args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] })
    writeFileSync(join(dir, "run-test.sh"), "#!/bin/sh\nexit 1\n")
    execFileSync("chmod", ["+x", join(dir, "run-test.sh")])
    git(["add", "."])
    git(["commit", "-qm", "add failing test script"])
    git(["checkout", "-qb", "feat-a"])
    writeFileSync(join(dir, "d.txt"), "d\n")
    git(["add", "."])
    git(["commit", "-qm", "feat-a"])
    git(["checkout", "-q", "main"])

    const report = await MergeCoordinator.validateMerge({
      repoDir: dir,
      base: "main",
      testCommand: "./run-test.sh",
    })
    expect(report.merged).toContain("feat-a")
    expect(report.testsPassed).toBe(false)
    expect(report.ok).toBe(false)
  })

  test("no feature branches returns ok", async () => {
    const dir = makeRepo()
    const report = await MergeCoordinator.validateMerge({ repoDir: dir, base: "main" })
    expect(report.ok).toBe(true)
    expect(report.branches).toEqual([])
  })

  test("formatMergeReport is readable", () => {
    const report = {
      ok: true,
      base: "main",
      branches: ["feat-a"],
      merged: ["feat-a"],
      conflicted: [],
      testsPassed: true,
      testOutput: "ok",
      tempDir: "/tmp/x",
    }
    const text = MergeCoordinator.formatMergeReport(report)
    expect(text).toContain("Merge validation: PASS")
    expect(text).toContain("feat-a")
  })
})