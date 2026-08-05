import { describe, expect, test } from "bun:test"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Backlog } from "@opencode-ai/core/pipeline/backlog"
import { Observability } from "@opencode-ai/core/pipeline/observability"

function tmpFile(): string {
  return join(mkdtempSync(join(tmpdir(), "observability-test-")), "observability.json")
}

describe("ObservabilityEngine", () => {
  test("record stores an event", async () => {
    const engine = new Observability.ObservabilityEngine(tmpFile())
    const event = await engine.record({ source: "worker", level: "info", message: "started", context: { pid: 1 } })
    expect(event).not.toBeNull()
    expect(event?.source).toBe("worker")
    expect(event?.level).toBe("info")

    const list = await engine.list()
    expect(list).toHaveLength(1)
    expect(list[0].context).toEqual({ pid: 1 })
    expect(list[0].timestamp).toBeGreaterThan(0)
  })

  test("dedupe skips identical events within window", async () => {
    const engine = new Observability.ObservabilityEngine(tmpFile())
    await engine.record({ source: "worker", level: "error", message: "boom" })
    await engine.record({ source: "worker", level: "error", message: "boom" })
    expect(await engine.list()).toHaveLength(1)
  })

  test("dedupe does not skip different events", async () => {
    const engine = new Observability.ObservabilityEngine(tmpFile())
    await engine.record({ source: "worker", level: "error", message: "boom" })
    await engine.record({ source: "worker", level: "error", message: "boom again" })
    await engine.record({ source: "other", level: "error", message: "boom" })
    await engine.record({ source: "worker", level: "info", message: "boom" })
    expect(await engine.list()).toHaveLength(4)
  })

  test("dedupe respects dedupeWindowMs", async () => {
    const engine = new Observability.ObservabilityEngine(tmpFile(), { dedupeWindowMs: 0 })
    await engine.record({ source: "s", level: "warn", message: "m" })
    await Bun.sleep(5)
    await engine.record({ source: "s", level: "warn", message: "m" })
    expect(await engine.list()).toHaveLength(2)
  })

  test("error event creates backlog item", async () => {
    const backlog = new Backlog.BacklogEngine(tmpFile())
    const engine = new Observability.ObservabilityEngine(tmpFile(), undefined, backlog)
    await engine.record({ source: "api", level: "error", message: "500 on /users" })
    const items = await backlog.list()
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe("[api] 500 on /users")
    expect(items[0].type).toBe("bug")
    expect(items[0].source).toBe("observability")
  })

  test("duplicate error does not duplicate backlog item", async () => {
    const backlog = new Backlog.BacklogEngine(tmpFile())
    const engine = new Observability.ObservabilityEngine(tmpFile(), undefined, backlog)
    await engine.record({ source: "api", level: "error", message: "boom" })
    await engine.record({ source: "api", level: "error", message: "boom" })
    expect(await backlog.list()).toHaveLength(1)
  })

  test("non-error events do not create backlog items", async () => {
    const backlog = new Backlog.BacklogEngine(tmpFile())
    const engine = new Observability.ObservabilityEngine(tmpFile(), undefined, backlog)
    await engine.record({ source: "api", level: "warn", message: "slow" })
    await engine.record({ source: "api", level: "info", message: "ok" })
    expect(await backlog.list()).toEqual([])
  })

  test("error without backlog does not crash", async () => {
    const engine = new Observability.ObservabilityEngine(tmpFile())
    const event = await engine.record({ source: "api", level: "error", message: "no backlog" })
    expect(event).not.toBeNull()
    expect(await engine.list()).toHaveLength(1)
  })

  test("counts are correct", async () => {
    const engine = new Observability.ObservabilityEngine(tmpFile())
    await engine.record({ source: "a", level: "info", message: "1" })
    await engine.record({ source: "a", level: "warn", message: "2" })
    await engine.record({ source: "a", level: "error", message: "3" })
    await engine.record({ source: "a", level: "info", message: "4" })
    expect(await engine.counts()).toEqual({ info: 2, warn: 1, error: 1, total: 4 })
  })

  test("trims events to maxEvents", async () => {
    const engine = new Observability.ObservabilityEngine(tmpFile(), { maxEvents: 3 })
    for (let i = 0; i < 5; i++) {
      await engine.record({ source: "s", level: "info", message: `m${i}` })
      await Bun.sleep(1)
    }
    const list = await engine.list()
    expect(list).toHaveLength(3)
    expect(list.map((event) => event.message)).toEqual(["m4", "m3", "m2"])
  })

  test("list filters by level and limits", async () => {
    const engine = new Observability.ObservabilityEngine(tmpFile())
    await engine.record({ source: "a", level: "info", message: "1" })
    await Bun.sleep(2)
    await engine.record({ source: "a", level: "error", message: "2" })
    const errors = await engine.list("error")
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe("2")
    const limited = await engine.list(undefined, 1)
    expect(limited).toHaveLength(1)
    expect(limited[0].message).toBe("2")
  })

  test("persists events across engine instances", async () => {
    const path = tmpFile()
    const engine = new Observability.ObservabilityEngine(path)
    await engine.record({ source: "a", level: "info", message: "persisted" })
    await engine.record({ source: "a", level: "error", message: "errored" })

    const reloaded = new Observability.ObservabilityEngine(path)
    expect(await reloaded.list()).toHaveLength(2)
    expect(await reloaded.counts()).toEqual({ info: 1, warn: 0, error: 1, total: 2 })
  })

  test("corrupt file falls back to empty list without crashing", async () => {
    const path = tmpFile()
    writeFileSync(path, "[[[broken json")
    const engine = new Observability.ObservabilityEngine(path)
    expect(await engine.list()).toEqual([])
    const event = await engine.record({ source: "a", level: "info", message: "after corrupt" })
    expect(event).not.toBeNull()
    expect(await engine.list()).toHaveLength(1)
  })

  test("record rejects messages longer than 500 chars", async () => {
    const engine = new Observability.ObservabilityEngine(tmpFile())
    expect(
      engine.record({ source: "a", level: "info", message: "x".repeat(501) }),
    ).rejects.toThrow("message too long")
  })
})
