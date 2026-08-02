import { describe, expect, test } from "bun:test"
import { defer } from "@/util/defer"

describe("defer", () => {
  test("synchronous dispose calls the function", () => {
    let called = false
    {
      using _ = defer(() => {
        called = true
      })
    }
    expect(called).toBe(true)
  })

  test("async dispose awaits the function", async () => {
    let called = false
    {
      await using _ = defer(async () => {
        called = true
      })
    }
    expect(called).toBe(true)
  })

  test("passes returned value through", async () => {
    let result = ""
    {
      await using _ = defer(() => {
        result = "cleanup"
      })
      result = "work"
    }
    expect(result).toBe("cleanup")
  })
})
