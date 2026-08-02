import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { Command } from "@/command"

describe("Command.Default", () => {
  test("includes expected command names", () => {
    expect(Command.Default.INIT).toBe("init")
    expect(Command.Default.REVIEW).toBe("review")
    expect(Command.Default.DISCOVER).toBe("discover")
    expect(Command.Default.RESEARCH).toBe("research")
    expect(Command.Default.PLAN_CREATE).toBe("plan-create")
    expect(Command.Default.PLAN_REVIEW).toBe("plan-review")
    expect(Command.Default.DEBATE).toBe("debate")
    expect(Command.Default.SELF_CRITIQUE).toBe("self-critique")
    expect(Command.Default.ATTACH).toBe("attach")
    expect(Command.Default.PIPELINE).toBe("pipeline")
    expect(Command.Default.MISSION).toBe("mission")
    expect(Command.Default.AUDIT_REPORT).toBe("audit-report")
    expect(Command.Default.DELIVER).toBe("deliver")
  })

  test("pipeline variants have correct names", () => {
    expect(Command.Default.PIPELINE_BUG).toBe("pipeline-bug")
    expect(Command.Default.PIPELINE_REVIEW).toBe("pipeline-review")
    expect(Command.Default.PIPELINE_REFACTOR).toBe("pipeline-refactor")
    expect(Command.Default.PIPELINE_UPGRADE).toBe("pipeline-upgrade")
    expect(Command.Default.PIPELINE_PERFORMANCE).toBe("pipeline-performance")
    expect(Command.Default.PIPELINE_SECURITY).toBe("pipeline-security")
    expect(Command.Default.PIPELINE_DEPLOY).toBe("pipeline-deploy")
    expect(Command.Default.PIPELINE_TESTING).toBe("pipeline-testing")
    expect(Command.Default.PIPELINE_DOCS).toBe("pipeline-docs")
  })
})

describe("Command.hints", () => {
  test("extracts numbered placeholders", () => {
    expect(Command.hints("do $1 and $2")).toEqual(["$1", "$2"])
  })

  test("extracts $ARGUMENTS when present", () => {
    expect(Command.hints("do $ARGUMENTS")).toEqual(["$ARGUMENTS"])
  })

  test("extracts both numbered and $ARGUMENTS", () => {
    expect(Command.hints("$1: $ARGUMENTS")).toEqual(["$1", "$ARGUMENTS"])
  })

  test("deduplicates repeated placeholders", () => {
    expect(Command.hints("$1 and $1 and $2")).toEqual(["$1", "$2"])
  })

  test("returns empty array when no placeholders exist", () => {
    expect(Command.hints("plain text without tokens")).toEqual([])
  })

  test("handles empty string", () => {
    expect(Command.hints("")).toEqual([])
  })
})

describe("Command.Info", () => {
  test("schema parses valid input", () => {
    const parsed = Schema.decodeUnknownSync(Command.Info)({
      name: "test-cmd",
      description: "a test command",
      source: "command",
      template: "hello $1",
      hints: ["$1"],
    })
    expect(parsed.name).toBe("test-cmd")
    expect(parsed.description).toBe("a test command")
    expect(parsed.source).toBe("command")
    expect(parsed.hints).toEqual(["$1"])
  })
})
