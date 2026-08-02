import { describe, expect, test } from "bun:test"
import { split, join } from "@/util/bom"

const BOM = String.fromCharCode(0xfeff)

describe("BOM split", () => {
  test("detects BOM prefix", () => {
    expect(split(BOM + "hello")).toEqual({ bom: true, text: "hello" })
  })

  test("returns bom: false when no BOM", () => {
    expect(split("hello")).toEqual({ bom: false, text: "hello" })
  })

  test("handles empty string", () => {
    expect(split("")).toEqual({ bom: false, text: "" })
  })
})

describe("BOM join", () => {
  test("adds BOM when bom is true", () => {
    expect(join("hello", true)).toBe(BOM + "hello")
  })

  test("strips existing BOM before adding", () => {
    expect(join(BOM + "hello", true)).toBe(BOM + "hello")
  })

  test("returns stripped text when bom is false", () => {
    expect(join(BOM + "hello", false)).toBe("hello")
  })

  test("returns plain text when no BOM and bom is false", () => {
    expect(join("hello", false)).toBe("hello")
  })
})
