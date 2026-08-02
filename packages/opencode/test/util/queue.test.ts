import { describe, expect, test } from "bun:test"
import { AsyncQueue, work } from "@/util/queue"

describe("AsyncQueue", () => {
  test("pushes and pops items in order", async () => {
    const q = new AsyncQueue<number>()
    q.push(1)
    q.push(2)
    expect(await q.next()).toBe(1)
    expect(await q.next()).toBe(2)
  })

  test("awaits item pushed after next()", async () => {
    const q = new AsyncQueue<number>()
    const promise = q.next()
    q.push(42)
    expect(await promise).toBe(42)
  })

  test("is async iterable", async () => {
    const q = new AsyncQueue<number>()
    q.push(10)
    q.push(20)

    const results: number[] = []
    const iterator = q[Symbol.asyncIterator]()
    results.push((await iterator.next()).value!)
    results.push((await iterator.next()).value!)
    expect(results).toEqual([10, 20])
  })
})

describe("work", () => {
  test("processes all items with limited concurrency", async () => {
    const processed: number[] = []
    await work(2, [1, 2, 3, 4], async (item) => {
      processed.push(item)
    })
    expect(processed.sort()).toEqual([1, 2, 3, 4])
  })

  test("handles empty array", async () => {
    const fn = async () => {}
    await expect(work(2, [], fn)).resolves.toBeUndefined()
  })
})
