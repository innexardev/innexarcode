import { describe, expect, test } from "bun:test"
import { SessionEvent } from "@opencode-ai/core/session/event"
import { EventManifest as SchemaEventManifest } from "@opencode-ai/schema/event-manifest"
import { Todo } from "@/session/todo"
import { EventManifest } from "@/event-manifest"

describe("public event manifest", () => {
  test("contains every latest public wire type once", () => {
    expect(EventManifest.Definitions).toBe(SchemaEventManifest.Definitions)
    expect(EventManifest.Latest).toBe(SchemaEventManifest.Latest)
    expect(EventManifest.Durable).toBe(SchemaEventManifest.Durable)
    expect(EventManifest.Latest.size).toBe(88)
    expect(EventManifest.Latest.get("session.next.step.ended")).toBe(SessionEvent.Step.Ended)
    expect(EventManifest.Latest.get("todo.updated")).toBe(Todo.Event.Updated)
    expect(EventManifest.Latest.has("ide.installed")).toBe(false)
    expect(EventManifest.Latest.has("server.connected")).toBe(true)
    expect(EventManifest.Latest.has("global.disposed")).toBe(true)
  })

  test("contains only the current step settlement versions", () => {
    expect(EventManifest.Durable.has("session.next.step.ended.1")).toBe(false)
    expect(EventManifest.Durable.get("session.next.step.ended.2")).toBe(SessionEvent.Step.Ended)
  })

  test("contains core session events in Latest", () => {
    expect(EventManifest.Latest.has("session.created")).toBe(true)
    expect(EventManifest.Latest.has("session.updated")).toBe(true)
    expect(EventManifest.Latest.has("session.idle")).toBe(true)
  })

  test("contains agent and tool events", () => {
    expect(EventManifest.Latest.has("session.next.agent.switched")).toBe(true)
    expect(EventManifest.Latest.has("session.next.tool.called")).toBe(true)
    expect(EventManifest.Latest.has("session.next.tool.success")).toBe(true)
  })

  test("Definitions is frozen and cannot be mutated", () => {
    expect(Object.isFrozen(EventManifest.Definitions)).toBe(true)
  })
})
