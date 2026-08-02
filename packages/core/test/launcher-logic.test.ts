import { describe, expect, test } from "bun:test"
import { sep } from "node:path"

// ── Pure functions extracted from packages/tui/src/routes/launcher.tsx ──

function fuzzyScore(query: string, text: string): number {
  if (!query) return 1
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  if (t === q) return 2
  if (t.startsWith(q)) return 1.5
  if (t.includes(q)) return 1
  let qi = 0
  let matched = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) { matched++; qi++ }
  }
  if (qi === q.length) return 0.5 + (matched / t.length) * 0.5
  return 0
}

function truncatePath(p: string, maxLen: number): string {
  if (p.length <= maxLen) return p
  const parts = p.split(sep)
  if (parts.length <= 2) return p.slice(0, maxLen - 3) + "..."
  let result = parts[0] + sep
  const last = parts[parts.length - 1]
  const remaining = maxLen - result.length - last.length - 4
  if (remaining < 3) return parts[0] + sep + "..." + sep + last
  const middle = parts.slice(1, -1).join(sep)
  if (middle.length <= remaining) return result + middle + sep + last
  return result + middle.slice(0, remaining) + "..." + sep + last
}

// ── fuzzyScore tests ──

describe("fuzzyScore", () => {
  test("empty query returns 1 (show everything)", () => {
    expect(fuzzyScore("", "anything")).toBe(1)
    expect(fuzzyScore("", "")).toBe(1)
  })

  test("exact match returns 2", () => {
    expect(fuzzyScore("hello", "hello")).toBe(2)
    expect(fuzzyScore("Hello", "hello")).toBe(2)
    expect(fuzzyScore("hello", "HELLO")).toBe(2)
  })

  test("prefix match returns 1.5", () => {
    expect(fuzzyScore("hel", "hello")).toBe(1.5)
    expect(fuzzyScore("HEL", "hello")).toBe(1.5)
  })

  test("substring match returns 1", () => {
    expect(fuzzyScore("ell", "hello")).toBe(1)
    expect(fuzzyScore("lo", "hello")).toBe(1)
  })

  test("fuzzy match returns > 0 for non-contiguous matching chars", () => {
    const score = fuzzyScore("hlo", "hello")
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(1)
  })

  test("fuzzy match score increases with more matched characters", () => {
    const scoreFew = fuzzyScore("hlo", "hello")
    const scoreMany = fuzzyScore("helo", "hello")
    expect(scoreMany).toBeGreaterThan(scoreFew)
  })

  test("no match returns 0", () => {
    expect(fuzzyScore("xyz", "hello")).toBe(0)
    expect(fuzzyScore("abc", "")).toBe(0)
  })

  test("empty text and non-empty query returns 0", () => {
    expect(fuzzyScore("a", "")).toBe(0)
  })

  test("case insensitive matching", () => {
    expect(fuzzyScore("HELLO", "hello")).toBe(2)
    expect(fuzzyScore("hello", "HELLO")).toBe(2)
    expect(fuzzyScore("HEL", "hello")).toBe(1.5)
  })

  test("fuzzy match with repeated characters", () => {
    const score = fuzzyScore("ll", "hello")
    expect(score).toBeGreaterThan(0)
  })

  test("fuzzy score calculation with good match ratio", () => {
    // "hlo" in "hello" -> 3 matched, length 5 -> 0.5 + (3/5)*0.5 = 0.8
    const score = fuzzyScore("hlo", "hello")
    expect(score).toBeCloseTo(0.8, 5)
  })

  test("query longer than text returns 0", () => {
    expect(fuzzyScore("hello world", "hello")).toBe(0)
  })

  test("matches special characters", () => {
    // "test-project" starts with "test" → prefix match 1.5
    expect(fuzzyScore("test", "test-project")).toBe(1.5)
    expect(fuzzyScore("tst", "test-project")).toBeGreaterThan(0)
  })
})

// ── truncatePath tests ──

describe("truncatePath", () => {
  test("short path unchanged", () => {
    const p = "/home/user/project"
    expect(truncatePath(p, 100)).toBe(p)
  })

  test("path exactly at maxLen unchanged", () => {
    const p = "/home/user/projects/myapp"
    expect(truncatePath(p, p.length)).toBe(p)
  })

  test("long path adds ellipsis in middle", () => {
    const result = truncatePath("/home/user/projects/myapp/frontend/src", 30)
    expect(result.length).toBeLessThanOrEqual(33)
    expect(result).toContain("...")
    // Should preserve first and last parts
    expect(result.startsWith("/home/")).toBe(true)
    expect(result.endsWith("/src")).toBe(true) // last component preserved
  })

  test("preserves project name (last segment)", () => {
    const result = truncatePath("/very/long/path/with/many/dirs/project-name", 30)
    expect(result).toContain("project-name")
    expect(result.endsWith("/project-name")).toBe(true)
  })

  test("very long single filename truncated at end", () => {
    const result = truncatePath("a".repeat(100), 20)
    expect(result.length).toBeLessThanOrEqual(20)
    expect(result.endsWith("...")).toBe(true)
  })

  test("path with only root and one dir", () => {
    // When the last segment is longer than maxLen, the algorithm
    // preserves last segment and adds "..." in the middle
    const p = "/a/really-long-name-that-exceeds-max-length"
    const result = truncatePath(p, 20)
    // Preserves last segment, so result may exceed maxLen
    expect(result).toContain("...")
    expect(result).toContain("really-long-name-that-exceeds-max-length")
  })

  test("windows-style path handled correctly", () => {
    // sep on linux is "/", so this tests the general algorithm behavior
    const p = "C:/Users/user/projects/myapp/src"
    const result = truncatePath(p, 25)
    expect(result.length).toBeLessThanOrEqual(28)
    expect(result).toContain("...")
  })

  test("preserves leading slash", () => {
    const result = truncatePath("/a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p", 25)
    expect(result.startsWith("/")).toBe(true)
  })

  test("empty string returns empty", () => {
    expect(truncatePath("", 10)).toBe("")
  })

  test("single segment", () => {
    expect(truncatePath("justafile.txt", 50)).toBe("justafile.txt")
    // slice(0, maxLen-3) + "...", so 5-3=2 → "ju..."
    expect(truncatePath("justafile.txt", 5)).toBe("ju...")
  })
})
