import { describe, expect, test } from "bun:test"

// ── Pure logic extracted from packages/tui/src/panel/cockpit.tsx ──

const PIPELINE = [
  "discovery", "research", "planning", "architecture", "debate",
  "implementation", "review", "qa", "security",
  "self-critique", "question", "audit", "delivery",
] as const

type PhaseStatus = "pending" | "running" | "done" | "failed"

function phaseStatus(phaseIdx: number, i: number): PhaseStatus {
  if (phaseIdx < 0) return "pending"
  if (i < phaseIdx) return "done"
  if (i === phaseIdx) return "running"
  return "pending"
}

function statusColor(status: PhaseStatus, theme: { success: string; warning: string; error: string; textMuted: string }) {
  switch (status) {
    case "done": return theme.success
    case "running": return theme.warning
    case "failed": return theme.error
    default: return theme.textMuted
  }
}

function statusSymbol(status: PhaseStatus): string {
  switch (status) {
    case "done": return "\u2713"
    case "running": return "\u25CF"
    case "failed": return "\u2715"
    default: return "\u25CB"
  }
}

function completedCount(phaseIdx: number): number {
  return phaseIdx < 0 ? 0 : phaseIdx
}

function bar(pct: number, w: number) {
  const filled = Math.max(1, Math.floor((pct / 100) * (w - 2)))
  const empty = Math.max(0, w - 2 - filled)
  return { filled: "\u2588".repeat(filled), empty: "\u2591".repeat(empty), pct }
}

// ── Tests ──

describe("phaseStatus", () => {
  test("returns pending when phaseIdx < 0", () => {
    expect(phaseStatus(-1, 0)).toBe("pending")
    expect(phaseStatus(-1, 5)).toBe("pending")
    expect(phaseStatus(-1, 12)).toBe("pending")
  })

  test("returns done for phases before current index", () => {
    expect(phaseStatus(3, 0)).toBe("done")
    expect(phaseStatus(3, 1)).toBe("done")
    expect(phaseStatus(3, 2)).toBe("done")
  })

  test("returns running for the current phase index", () => {
    expect(phaseStatus(3, 3)).toBe("running")
    expect(phaseStatus(0, 0)).toBe("running")
    expect(phaseStatus(12, 12)).toBe("running")
  })

  test("returns pending for phases after current index", () => {
    expect(phaseStatus(3, 4)).toBe("pending")
    expect(phaseStatus(3, 12)).toBe("pending")
    expect(phaseStatus(0, 1)).toBe("pending")
  })

  test("returns done for all when phaseIdx past last", () => {
    // After complete pipeline (phaseIdx = 13, past last index 12)
    expect(phaseStatus(13, 0)).toBe("done")
    expect(phaseStatus(13, 12)).toBe("done")
  })

  test("handles all 13 phases as pending when no pipeline active", () => {
    for (let i = 0; i < PIPELINE.length; i++) {
      expect(phaseStatus(-1, i)).toBe("pending")
    }
  })

  test("handles all 13 phases correctly mid-pipeline", () => {
    // At phase 5 (implementation, 0-indexed)
    const idx = 5
    for (let i = 0; i < idx; i++) expect(phaseStatus(idx, i)).toBe("done")
    expect(phaseStatus(idx, idx)).toBe("running")
    for (let i = idx + 1; i < PIPELINE.length; i++) expect(phaseStatus(idx, i)).toBe("pending")
  })
})

describe("statusColor", () => {
  const theme = { success: "green", warning: "amber", error: "red", textMuted: "gray" }

  test("done returns success color", () => {
    expect(statusColor("done", theme)).toBe("green")
  })

  test("running returns warning color", () => {
    expect(statusColor("running", theme)).toBe("amber")
  })

  test("failed returns error color", () => {
    expect(statusColor("failed", theme)).toBe("red")
  })

  test("pending returns muted color", () => {
    expect(statusColor("pending", theme)).toBe("gray")
  })
})

describe("statusSymbol", () => {
  test("done returns checkmark", () => {
    expect(statusSymbol("done")).toBe("\u2713")
  })

  test("running returns bullet", () => {
    expect(statusSymbol("running")).toBe("\u25CF")
  })

  test("failed returns cross", () => {
    expect(statusSymbol("failed")).toBe("\u2715")
  })

  test("pending returns circle", () => {
    expect(statusSymbol("pending")).toBe("\u25CB")
  })
})

describe("completedCount", () => {
  test("returns 0 when phaseIdx < 0", () => {
    expect(completedCount(-1)).toBe(0)
  })

  test("returns phaseIdx for valid index", () => {
    expect(completedCount(0)).toBe(0)
    expect(completedCount(1)).toBe(1)
    expect(completedCount(5)).toBe(5)
    expect(completedCount(13)).toBe(13)
  })

  test("returns 0 for first phase (index 0 = just started)", () => {
    expect(completedCount(0)).toBe(0)
  })
})

describe("bar", () => {
  test("returns at least 1 filled block for any positive percentage", () => {
    const b = bar(1, 20)
    expect(b.filled.length).toBeGreaterThanOrEqual(1)
    expect(b.pct).toBe(1)
  })

  test("filled + empty = width - 2", () => {
    const b = bar(50, 30)
    expect(b.filled.length + b.empty.length).toBe(28)
  })

  test("100% fills all available space", () => {
    const b = bar(100, 20)
    expect(b.filled.length).toBe(18)
    expect(b.empty.length).toBe(0)
  })

  test("0% still has 1 filled block", () => {
    const b = bar(0, 20)
    expect(b.filled.length).toBeGreaterThanOrEqual(1)
  })

  test("uses full block and light shade characters", () => {
    const b = bar(50, 20)
    expect(b.filled).toContain("\u2588")
    expect(b.empty).toContain("\u2591")
  })

  test("pct value is preserved exactly", () => {
    expect(bar(42, 20).pct).toBe(42)
  })
})

describe("PIPELINE constant", () => {
  test("has exactly 13 phases", () => {
    expect(PIPELINE.length).toBe(13)
  })

  test("phases are in correct order", () => {
    expect(PIPELINE[0]).toBe("discovery")
    expect(PIPELINE[1]).toBe("research")
    expect(PIPELINE[2]).toBe("planning")
    expect(PIPELINE[3]).toBe("architecture")
    expect(PIPELINE[4]).toBe("debate")
    expect(PIPELINE[5]).toBe("implementation")
    expect(PIPELINE[6]).toBe("review")
    expect(PIPELINE[7]).toBe("qa")
    expect(PIPELINE[8]).toBe("security")
    expect(PIPELINE[9]).toBe("self-critique")
    expect(PIPELINE[10]).toBe("question")
    expect(PIPELINE[11]).toBe("audit")
    expect(PIPELINE[12]).toBe("delivery")
  })
})
