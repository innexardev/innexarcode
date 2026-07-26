import { describe, expect, test } from "bun:test"
import { MISSION_TYPES, type MissionType } from "@opencode-ai/core/mission"
import { PipelineStateMachine, PHASE_ORDER } from "@opencode-ai/core/pipeline/state"

describe("Mission Engine", () => {
  test("has 16 mission types", () => {
    expect(MISSION_TYPES.length).toBe(16)
  })

  test("includes all expected mission types", () => {
    const expected: MissionType[] = [
      "create", "feature", "bugfix", "review", "refactor",
      "upgrade", "performance", "security", "database",
      "deploy", "testing", "docs", "devops", "api",
      "frontend", "backend",
    ]
    for (const m of expected) {
      expect(MISSION_TYPES).toContain(m)
    }
  })

  test("all mission types are non-empty strings", () => {
    for (const m of MISSION_TYPES) {
      expect(typeof m).toBe("string")
      expect(m.length).toBeGreaterThan(0)
    }
  })

  test("Pipeline phases match expected order", () => {
    expect(PHASE_ORDER[0]).toBe("discovery")
    expect(PHASE_ORDER[4]).toBe("debate")
    expect(PHASE_ORDER[8]).toBe("security")
    expect(PHASE_ORDER[12]).toBe("delivery")
  })

  test("Pipeline has exactly 13 phases", () => {
    expect(PHASE_ORDER.length).toBe(13)
  })
})
