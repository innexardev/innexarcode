import { describe, test, expect } from "bun:test"
import { GlobalBus, type GlobalEvent } from "@/bus/global"

describe("GlobalBus", () => {
  test("emits and receives events", () => {
    const received: GlobalEvent[] = []
    const listener = (event: GlobalEvent) => { received.push(event) }
    GlobalBus.on("event", listener)
    GlobalBus.emit("event", { directory: "/tmp", payload: { type: "test" } })
    GlobalBus.off("event", listener)
    expect(received.length).toBe(1)
    expect(received[0].directory).toBe("/tmp")
    expect(received[0].payload.type).toBe("test")
  })

  test("payload gets an id if missing", () => {
    const received: GlobalEvent[] = []
    const listener = (event: GlobalEvent) => { received.push(event) }
    GlobalBus.on("event", listener)
    GlobalBus.emit("event", { payload: { type: "test" } })
    GlobalBus.off("event", listener)
    expect(received.length).toBe(1)
    expect(received[0].payload.id).toBeDefined()
    expect(typeof received[0].payload.id).toBe("string")
  })

  test("payload with existing id is not overwritten", () => {
    const received: GlobalEvent[] = []
    const listener = (event: GlobalEvent) => { received.push(event) }
    GlobalBus.on("event", listener)
    GlobalBus.emit("event", { payload: { id: "custom-id", type: "test" } })
    GlobalBus.off("event", listener)
    expect(received[0].payload.id).toBe("custom-id")
  })

  test("multiple listeners all receive events", () => {
    const results: number[] = []
    const a = () => { results.push(1) }
    const b = () => { results.push(2) }
    GlobalBus.on("event", a)
    GlobalBus.on("event", b)
    GlobalBus.emit("event", { payload: { type: "test" } })
    GlobalBus.off("event", a)
    GlobalBus.off("event", b)
    expect(results).toContain(1)
    expect(results).toContain(2)
  })

  test("removed listener does not receive events", () => {
    const results: string[] = []
    const fn = () => { results.push("should not fire") }
    GlobalBus.on("event", fn)
    GlobalBus.off("event", fn)
    GlobalBus.emit("event", { payload: { type: "test" } })
    expect(results.length).toBe(0)
  })
})
