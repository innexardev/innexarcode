import { describe, expect, test } from "bun:test"
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { Backlog } from "@opencode-ai/core/pipeline/backlog"

function tmpFile(): string {
  return join(mkdtempSync(join(tmpdir(), "backlog-test-")), "backlog.json")
}

describe("BacklogEngine", () => {
  test("add computes RICE priority correctly", async () => {
    const engine = new Backlog.BacklogEngine(tmpFile())
    const a = await engine.add({ title: "A", reach: 10, impact: 3, confidence: 1, effort: 4 })
    expect(a.priority).toBeCloseTo((10 * 3 * 1) / 4)

    const lowerEffort = await engine.add({ title: "lower effort", reach: 10, impact: 3, confidence: 1, effort: 2 })
    expect(lowerEffort.priority).toBeGreaterThan(a.priority)

    const higherReach = await engine.add({ title: "higher reach", reach: 10, impact: 10, confidence: 1, effort: 1 })
    expect(higherReach.priority).toBeGreaterThan(lowerEffort.priority)

    const defaults = await engine.add({ title: "defaults" })
    expect(defaults.priority).toBe(1)
    expect(defaults.status).toBe("open")
    expect(defaults.type).toBe("feature")
    expect(defaults.source).toBe("manual")

    const items = await engine.list()
    expect(items[0].id).toBe(higherReach.id)
  })

  test("RICE factors are clamped to 1-10 (effort minimum 1)", async () => {
    const engine = new Backlog.BacklogEngine(tmpFile())
    const clamped = await engine.add({
      title: "clamped",
      reach: 0,
      impact: 100,
      confidence: 0.8,
      effort: 0,
    })
    expect(clamped.reach).toBe(1)
    expect(clamped.impact).toBe(10)
    expect(clamped.confidence).toBe(1)
    expect(clamped.effort).toBe(1)
    expect(clamped.priority).toBe(10)
  })

  test("list sorts by priority desc then createdAt asc", async () => {
    const engine = new Backlog.BacklogEngine(tmpFile())
    const first = await engine.add({ title: "first", reach: 1, impact: 1, confidence: 1, effort: 1 })
    const second = await engine.add({ title: "second", reach: 1, impact: 1, confidence: 1, effort: 1 })
    const items = await engine.list()
    expect(items.map((item) => item.id)).toEqual([first.id, second.id])
  })

  test("list filters by status", async () => {
    const engine = new Backlog.BacklogEngine(tmpFile())
    const item = await engine.add({ title: "filter me" })
    await engine.cancel(item.id)
    expect(await engine.list("open")).toEqual([])
    expect(await engine.list("cancelled")).toHaveLength(1)
    expect(await engine.list("all")).toHaveLength(1)
    expect(await engine.list()).toHaveLength(1)
  })

  test("next returns highest-priority open item", async () => {
    const engine = new Backlog.BacklogEngine(tmpFile())
    await engine.add({ title: "low", reach: 1, impact: 1, confidence: 1, effort: 10 })
    const high = await engine.add({ title: "high", reach: 10, impact: 10, confidence: 10, effort: 1 })
    const top = await engine.next()
    expect(top?.id).toBe(high.id)
    expect(top?.status).toBe("open")
  })

  test("next returns null when nothing open", async () => {
    const engine = new Backlog.BacklogEngine(tmpFile())
    expect(await engine.next()).toBeNull()
    const item = await engine.add({ title: "claimed" })
    await engine.claim(item.id, "agent")
    expect(await engine.next()).toBeNull()
  })

  test("claim then complete works", async () => {
    const engine = new Backlog.BacklogEngine(tmpFile())
    const item = await engine.add({ title: "fix login" })
    const claimed = await engine.claim(item.id, "agent-1")
    expect(claimed.status).toBe("claimed")
    expect(claimed.claimedBy).toBe("agent-1")
    expect(claimed.claimedAt).toBeGreaterThan(0)

    const done = await engine.complete(item.id)
    expect(done.status).toBe("done")
    expect(done.doneAt).toBeGreaterThan(0)
    expect(done.claimedBy).toBe("agent-1")
  })

  test("claim on already-claimed or unknown item throws", async () => {
    const engine = new Backlog.BacklogEngine(tmpFile())
    const item = await engine.add({ title: "dup claim" })
    await engine.claim(item.id, "agent-1")
    expect(engine.claim(item.id, "agent-2")).rejects.toThrow()
    expect(engine.claim("missing-id", "agent")).rejects.toThrow()
  })

  test("complete on non-claimed item throws", async () => {
    const engine = new Backlog.BacklogEngine(tmpFile())
    const item = await engine.add({ title: "not claimed" })
    expect(engine.complete(item.id)).rejects.toThrow()
  })

  test("cancel marks item cancelled", async () => {
    const engine = new Backlog.BacklogEngine(tmpFile())
    const item = await engine.add({ title: "cancel me" })
    const cancelled = await engine.cancel(item.id)
    expect(cancelled.status).toBe("cancelled")
    expect(await engine.next()).toBeNull()
  })

  test("prioritize recomputes priority", async () => {
    const engine = new Backlog.BacklogEngine(tmpFile())
    const item = await engine.add({ title: "reprioritize", reach: 1, impact: 1, confidence: 1, effort: 1 })
    const updated = await engine.prioritize(item.id, { reach: 9, impact: 9, confidence: 9, effort: 3 })
    expect(updated.priority).toBeCloseTo((9 * 9 * 9) / 3)
    expect(engine.prioritize("missing", { reach: 1, impact: 1, confidence: 1, effort: 1 })).rejects.toThrow()
  })

  test("counts reflect statuses", async () => {
    const engine = new Backlog.BacklogEngine(tmpFile())
    const a = await engine.add({ title: "a" })
    const b = await engine.add({ title: "b" })
    await engine.add({ title: "c" })
    await engine.claim(b.id, "agent")
    await engine.complete(b.id)
    await engine.cancel(a.id)
    expect(await engine.counts()).toEqual({ open: 1, claimed: 0, done: 1, cancelled: 1 })
  })

  test("persists items across engine instances", async () => {
    const path = tmpFile()
    const engine = new Backlog.BacklogEngine(path)
    await engine.add({ title: "persisted item", reach: 5 })
    await engine.add({ title: "claimed item" })

    const reloaded = new Backlog.BacklogEngine(path)
    const items = await reloaded.list()
    expect(items).toHaveLength(2)
    expect(items[0].title).toBe("persisted item")
    expect(items[0].priority).toBe(5)
  })

  test("corrupt file falls back to empty list without crashing", async () => {
    const path = tmpFile()
    writeFileSync(path, "{ definitely not json !!!")
    const engine = new Backlog.BacklogEngine(path)
    expect(await engine.list()).toEqual([])
    const item = await engine.add({ title: "after corrupt" })
    expect(item.status).toBe("open")
    expect(await engine.list()).toHaveLength(1)
  })

  test("corrupt file is renamed to .corrupt-* and not silently wiped", async () => {
    const path = tmpFile()
    writeFileSync(path, "{ definitely not json !!!")
    const engine = new Backlog.BacklogEngine(path)
    expect(await engine.list()).toEqual([])

    const corrupt = readdirSync(dirname(path)).filter((f) => f.startsWith("backlog.json.corrupt-"))
    expect(corrupt).toHaveLength(1)

    const item = await engine.add({ title: "after corrupt" })
    expect(item.status).toBe("open")
    expect(await engine.list()).toHaveLength(1)
  })

  test("invalid rows are dropped silently on load", async () => {
    const path = tmpFile()
    const valid = {
      id: "1",
      title: "valid item",
      type: "feature",
      source: "manual",
      status: "open",
      priority: 1,
      reach: 1,
      impact: 1,
      confidence: 1,
      effort: 1,
      createdAt: 1,
    }
    writeFileSync(path, JSON.stringify([valid, { garbage: true }, null, "row"]))
    const engine = new Backlog.BacklogEngine(path)
    const items = await engine.list()
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe("1")
  })

  test("missing file starts empty", async () => {
    const engine = new Backlog.BacklogEngine(tmpFile())
    expect(await engine.list()).toEqual([])
    expect(await engine.next()).toBeNull()
    expect(await engine.counts()).toEqual({ open: 0, claimed: 0, done: 0, cancelled: 0 })
  })
})
