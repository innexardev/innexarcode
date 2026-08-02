import { describe, expect, test } from "bun:test"
import { create, NotFound } from "@/util/local-context"

describe("local-context", () => {
  test("provide makes value available to use", () => {
    const ctx = create<string>("test")
    const result = ctx.provide("hello", () => ctx.use())
    expect(result).toBe("hello")
  })

  test("nested provide scopes correctly", () => {
    const ctx = create<string>("test")
    const result = ctx.provide("outer", () =>
      ctx.provide("inner", () => ctx.use()),
    )
    expect(result).toBe("inner")
  })

  test("use outside provide throws NotFound", () => {
    const ctx = create<string>("test")
    expect(() => ctx.use()).toThrow(NotFound)
  })

  test("different contexts are independent", () => {
    const a = create<string>("a")
    const b = create<string>("b")
    const result = a.provide("A", () => b.provide("B", () => a.use() + b.use()))
    expect(result).toBe("AB")
  })
})
