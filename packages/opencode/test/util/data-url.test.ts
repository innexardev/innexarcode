import { describe, expect, test } from "bun:test"
import { decodeDataUrl } from "../../src/util/data-url"

describe("decodeDataUrl", () => {
  test("decodes base64 data URLs", () => {
    const body = '{\n  "ok": true\n}\n'
    const url = `data:text/plain;base64,${Buffer.from(body).toString("base64")}`
    expect(decodeDataUrl(url)).toBe(body)
  })

  test("decodes plain data URLs", () => {
    expect(decodeDataUrl("data:text/plain,hello%20world")).toBe("hello world")
  })

  test("returns empty string when no comma separator", () => {
    expect(decodeDataUrl("data:text/plain")).toBe("")
  })

  test("handles empty string input", () => {
    expect(decodeDataUrl("")).toBe("")
  })

  test("decodes base64 without explicit charset", () => {
    const url = `data:;base64,${Buffer.from("hello").toString("base64")}`
    expect(decodeDataUrl(url)).toBe("hello")
  })
})
