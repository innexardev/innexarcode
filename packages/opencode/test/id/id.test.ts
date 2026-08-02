import { describe, test, expect } from "bun:test"
import { Identifier } from "@/id/id"

describe("Identifier", () => {
  test("ascending generates an ID with correct prefix", () => {
    const id = Identifier.ascending("session")
    expect(id).toMatch(/^ses_/)
  })

  test("descending generates an ID with correct prefix", () => {
    const id = Identifier.descending("session")
    expect(id).toMatch(/^ses_/)
  })

  test("ascending IDs are sortable in ascending order", () => {
    const a = Identifier.ascending("session")
    const b = Identifier.ascending("session")
    expect(a.localeCompare(b)).toBeLessThanOrEqual(0)
  })

  test("descending IDs are sortable in descending order", () => {
    const a = Identifier.descending("session")
    const b = Identifier.descending("session")
    expect(a.localeCompare(b)).toBeGreaterThanOrEqual(0)
  })

  test("token IDs start with corresponding prefix", () => {
    expect(Identifier.ascending("tool")).toMatch(/^tool_/)
    expect(Identifier.ascending("message")).toMatch(/^msg_/)
    expect(Identifier.ascending("event")).toMatch(/^evt_/)
    expect(Identifier.ascending("permission")).toMatch(/^per_/)
    expect(Identifier.ascending("part")).toMatch(/^prt_/)
    expect(Identifier.ascending("pty")).toMatch(/^pty_/)
    expect(Identifier.ascending("workspace")).toMatch(/^wrk_/)
    expect(Identifier.ascending("job")).toMatch(/^job_/)
    expect(Identifier.ascending("question")).toMatch(/^que_/)
  })

  test("ID has prefix + _ + hex + random chars", () => {
    const id = Identifier.ascending("session")
    expect(id).toMatch(/^ses_[0-9a-f]{12}[0-9a-zA-Z]{13,14}$/)
  })

  test("accepts a given ID if it matches the prefix", () => {
    const given = "ses_01ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    const id = Identifier.ascending("session", given)
    expect(id).toBe(given)
  })

  test("throws if given ID does not match prefix", () => {
    const given = "msg_01ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    expect(() => Identifier.ascending("session", given)).toThrow()
  })

  test("timestamps can be extracted from ascending IDs with timestamps below 2^48/4096", () => {
    const ts = 60_000_000_000 // ~1h into epoch, fits in 6 bytes after * 4096
    const id = Identifier.create("ses", "ascending", ts)
    const extracted = Identifier.timestamp(id)
    expect(extracted).toBe(ts)
  })
})
