import { describe, expect, test } from "bun:test"
import { signal } from "@/util/signal"

describe("signal", () => {
  test("trigger resolves the pending wait", async () => {
    const s = signal()
    const result = s.wait()
    s.trigger()
    expect(await result).toBeUndefined()
  })

  test("trigger can be called before wait", async () => {
    const s = signal()
    s.trigger()
    await expect(s.wait()).resolves.toBeUndefined()
  })

  test("multiple triggers do not throw", () => {
    const s = signal()
    s.trigger()
    expect(() => s.trigger()).not.toThrow()
  })

  test("multiple waits share the same promise", () => {
    const s = signal()
    const a = s.wait()
    const b = s.wait()
    expect(a).toBe(b)
  })
})
