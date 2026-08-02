import { describe, test, expect } from "bun:test"
import { Identifier } from "@/id/id"

describe("Sync", () => {
  test("EventID is created with evt_ prefix", () => {
    const id = Identifier.ascending("event")
    expect(id).toMatch(/^evt_/)
    expect(id.length).toBe(30)
  })

  test("EventID ascending are sortable", () => {
    const ids = Array.from({ length: 10 }, () => Identifier.ascending("event"))
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i - 1].localeCompare(ids[i])).toBeLessThanOrEqual(0)
    }
  })
})
