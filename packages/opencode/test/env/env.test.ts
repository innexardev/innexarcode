import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Env } from "@/env/index"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.mergeAll(LayerNode.compile(Env.node)))

describe("Env", () => {
  it.instance("get returns undefined for unknown key", () =>
    Effect.gen(function* () {
      const env = yield* Env.Service
      const val = yield* env.get("OPENTHIS_DOES_NOT_EXIST")
      expect(val).toBeUndefined()
    }),
  )

  it.instance("set and get a value", () =>
    Effect.gen(function* () {
      const env = yield* Env.Service
      yield* env.set("MY_TEST_KEY", "test_value")
      const val = yield* env.get("MY_TEST_KEY")
      expect(val).toBe("test_value")
    }),
  )

  it.instance("remove a value", () =>
    Effect.gen(function* () {
      const env = yield* Env.Service
      yield* env.set("MY_TEST_KEY", "test_value")
      yield* env.remove("MY_TEST_KEY")
      const val = yield* env.get("MY_TEST_KEY")
      expect(val).toBeUndefined()
    }),
  )

  it.instance("all returns all env vars", () =>
    Effect.gen(function* () {
      const env = yield* Env.Service
      yield* env.set("A", "1")
      yield* env.set("B", "2")
      const all = yield* env.all()
      expect(all.A).toBe("1")
      expect(all.B).toBe("2")
    }),
  )

  it.instance("set overrides existing value", () =>
    Effect.gen(function* () {
      const env = yield* Env.Service
      yield* env.set("K", "old")
      yield* env.set("K", "new")
      const val = yield* env.get("K")
      expect(val).toBe("new")
    }),
  )
})
