import { describe, expect, test } from "bun:test"
import { mkdtempSync, readdirSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { cleanupOrphanedTmp } from "@opencode-ai/core/pipeline/persist"

function age(path: string, hoursAgo: number): void {
  const old = new Date(Date.now() - hoursAgo * 60 * 60 * 1000)
  utimesSync(path, old, old)
}

describe("cleanupOrphanedTmp", () => {
  test("removes orphaned .tmp files older than 1h and returns the count", () => {
    const dir = mkdtempSync(join(tmpdir(), "pipeline-persist-test-"))
    writeFileSync(join(dir, "state.json.orphan.tmp"), "x")
    age(join(dir, "state.json.orphan.tmp"), 2)
    const removed = cleanupOrphanedTmp(dir)
    expect(removed).toBe(1)
    expect(readdirSync(dir)).toEqual([])
  })

  test("keeps fresh .tmp files (possibly a live write)", () => {
    const dir = mkdtempSync(join(tmpdir(), "pipeline-persist-test-"))
    writeFileSync(join(dir, "state.json.live.tmp"), "x")
    expect(cleanupOrphanedTmp(dir)).toBe(0)
    expect(readdirSync(dir)).toHaveLength(1)
  })

  test("prefix restricts cleanup to that engine's tmp files", () => {
    const dir = mkdtempSync(join(tmpdir(), "pipeline-persist-test-"))
    writeFileSync(join(dir, "state.json.orphan.tmp"), "x")
    writeFileSync(join(dir, "backlog.json.orphan.tmp"), "x")
    age(join(dir, "state.json.orphan.tmp"), 2)
    age(join(dir, "backlog.json.orphan.tmp"), 2)
    expect(cleanupOrphanedTmp(dir, "state.json")).toBe(1)
    expect(readdirSync(dir)).toEqual(["backlog.json.orphan.tmp"])
  })

  test("never touches non-tmp files or corrupt backups", () => {
    const dir = mkdtempSync(join(tmpdir(), "pipeline-persist-test-"))
    writeFileSync(join(dir, "state.json"), "{}")
    writeFileSync(join(dir, "state.json.corrupt-123"), "{}")
    expect(cleanupOrphanedTmp(dir)).toBe(0)
    expect(readdirSync(dir)).toHaveLength(2)
  })

  test("missing directory returns 0 without throwing", () => {
    expect(cleanupOrphanedTmp(join(tmpdir(), "pipeline-persist-missing-" + Date.now()))).toBe(0)
  })
})
