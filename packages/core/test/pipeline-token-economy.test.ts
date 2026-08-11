import { describe, expect, test } from "bun:test"
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { TokenEconomy } from "@opencode-ai/core/pipeline"

describe("TokenEconomy", () => {
  test("estimateTokens counts ~4 chars per token for plain text", () => {
    expect(TokenEconomy.estimateTokens("a".repeat(350))).toBe(88)
  })

  test("checkBudget returns status, ratio and action per threshold", () => {
    const config = {
      ...TokenEconomy.DEFAULT_BUDGETS,
      compact_at: 0.8,
      finalize_at: 0.9,
      hard_stop: 1.0,
    }
    const ok = TokenEconomy.checkBudget("agent", 150_000, config)
    expect(ok.status).toBe("ok")
    expect(ok.ratio).toBeCloseTo(0.5)
    expect(ok.recommendedAction.length).toBeGreaterThan(0)

    const compact = TokenEconomy.checkBudget("agent", 255_000, config)
    expect(compact.status).toBe("compact")
    expect(compact.ratio).toBeCloseTo(0.85)
    expect(compact.recommendedAction.length).toBeGreaterThan(0)

    const finalize = TokenEconomy.checkBudget("agent", 285_000, config)
    expect(finalize.status).toBe("finalize")
    expect(finalize.ratio).toBeCloseTo(0.95)
    expect(finalize.recommendedAction.length).toBeGreaterThan(0)

    const stop = TokenEconomy.checkBudget("agent", 305_000, config)
    expect(stop.status).toBe("stop")
    expect(stop.ratio).toBeCloseTo(305_000 / 300_000)
    expect(stop.recommendedAction.length).toBeGreaterThan(0)
  })

  test("budgetLimit returns per-level defaults", () => {
    expect(TokenEconomy.budgetLimit("session")).toBe(1_000_000)
    expect(TokenEconomy.budgetLimit("agent")).toBe(300_000)
    expect(TokenEconomy.budgetLimit("subagent")).toBe(100_000)
  })

  test("collector keeps stable-to-volatile order and rejects regressions", () => {
    const c = TokenEconomy.createContextCollector()
    c.add({ name: "AGENTS", tier: 0, content: "rules" })
    c.add({ name: "Memória", tier: 1, content: "summaries" })
    c.add({ name: "Task", tier: 2, content: "diff" })
    const built = c.build()
    expect(built.indexOf("## L0 AGENTS")).toBeLessThan(built.indexOf("## L1 Memória"))
    expect(built.indexOf("## L1 Memória")).toBeLessThan(built.indexOf("## L2 Task"))
    expect(() => c.add({ name: "Late", tier: 0, content: "x" })).toThrow(
      TokenEconomy.CacheOrderViolation,
    )
  })

  test("validateStable rejects timestamps and volatile markers; assertStable enforces tier 0", () => {
    expect(TokenEconomy.validateStable("2026-08-10T12:00 commit")).toBe(false)
    expect(TokenEconomy.validateStable("documentação estável")).toBe(true)
    expect(() =>
      TokenEconomy.assertStable({ tier: 0, name: "a", content: "now is 12:00" }),
    ).toThrow(TokenEconomy.CacheOrderViolation)
  })

  test("structured compaction round-trips goal, decisions, files and next step", () => {
    const state = {
      goal: "Economizar tokens",
      decisions: ["camadas 0-1-2"],
      files_changed: ["packages/core/src/pipeline/token-economy.ts"],
      pending_tasks: ["tool"],
      blockers: [],
      next_step: "registrar tool",
      completed: ["módulo core"],
    }
    const md = TokenEconomy.createStructuredCompaction(state)
    expect(md).toContain("## Objective")
    expect(md).toContain("- ")
    expect(md).toContain("Economizar tokens")

    const parsed = TokenEconomy.parseStructuredCompaction(md)
    expect(parsed.goal).toBe("Economizar tokens")
    expect(parsed.decisions[0]).toContain("camadas")
    expect(parsed.files_changed[0]).toContain("token-economy.ts")
    expect(parsed.next_step).toContain("registrar tool")
    expect(parsed.pending_tasks[0]).toContain("tool")
    expect(parsed.completed?.[0]).toContain("módulo core")
  })

  test("engine records metrics, compactions, breaches and persists per session", () => {
    const filePath = join(tmpdir(), `token-economy-test-${Date.now()}.json`)
    try {
      const engine = new TokenEconomy.TokenEconomyEngine(filePath)
      engine.record("agent", 1000, 200, 500)
      engine.record("agent", 2000, 300, 1000)
      engine.recordCompaction()
      const st = engine.status()
      expect(st.total.requests).toBe(2)
      expect(st.total.input_tokens).toBe(3000)
      expect(st.total.compactions).toBe(1)
      expect(st.total.cache_hit_rate).toBe(1500 / 4500)
      expect(st.total.estimated_cost).toBeGreaterThan(0)

      engine.record("agent", 400_000, 0, 0)
      const after = engine.status()
      expect(after.total.budget_breaches).toBe(1)

      engine.record("subagent", 10, 10, 0, "ws-a")
      const withSession = engine.status()
      expect(withSession.sessions["ws-a"].requests).toBe(1)

      const engine2 = new TokenEconomy.TokenEconomyEngine(filePath)
      expect(engine2.status().total.requests).toBe(4)
    } finally {
      unlinkSync(filePath)
    }
  })

  test("engine tolerates a corrupt metrics file and starts fresh", () => {
    const prefix = `token-economy-corrupt-${Date.now()}`
    const filePath = join(tmpdir(), `${prefix}.json`)
    try {
      writeFileSync(filePath, "not-json{{{")
      const engine = new TokenEconomy.TokenEconomyEngine(filePath)
      expect(() => engine.status()).not.toThrow()
      expect(engine.status().total.requests).toBe(0)
      expect(engine.status().total).toBeDefined()
    } finally {
      for (const name of readdirSync(tmpdir())) {
        if (name.startsWith(prefix)) rmSync(join(tmpdir(), name), { force: true })
      }
    }
  })

  test("cumulativeTokens sums input, output and cached", () => {
    expect(
      TokenEconomy.cumulativeTokens({
        requests: 0,
        input_tokens: 1,
        output_tokens: 2,
        cached_read: 3,
        estimated_cost: 0,
        budget_breaches: 0,
        compactions: 0,
        cache_hit_rate: 0,
      }),
    ).toBe(6)
  })

  test("budget breach triggers exactly at the limit (cumulative per session)", () => {
    const filePath = join(tmpdir(), `token-economy-breach-${Date.now()}.json`)
    try {
      const engine = new TokenEconomy.TokenEconomyEngine(filePath)
      engine.record("agent", 300_000, 0, 0)
      expect(engine.status().total.budget_breaches).toBe(1)

      const engine2 = new TokenEconomy.TokenEconomyEngine(
        join(tmpdir(), `token-economy-cum-${Date.now()}.json`),
      )
      engine2.record("agent", 200_000, 0, 0)
      expect(engine2.status().total.budget_breaches).toBe(0)
      engine2.record("agent", 200_000, 0, 0)
      expect(engine2.status().total.budget_breaches).toBe(1)
    } finally {
      for (const name of readdirSync(tmpdir())) {
        if (name.startsWith("token-economy-breach-") || name.startsWith("token-economy-cum-")) {
          rmSync(join(tmpdir(), name), { force: true })
        }
      }
    }
  })

  test("concurrent writers merge instead of last-write-wins", () => {
    const filePath = join(tmpdir(), `token-economy-merge-${Date.now()}.json`)
    try {
      const engineA = new TokenEconomy.TokenEconomyEngine(filePath)
      const engineB = new TokenEconomy.TokenEconomyEngine(filePath)
      engineA.record("agent", 100, 0, 0)
      engineB.record("agent", 200, 0, 0)
      const final = new TokenEconomy.TokenEconomyEngine(filePath)
      const st = final.status()
      expect(st.total.requests).toBe(2)
      expect(st.total.input_tokens).toBe(300)
    } finally {
      unlinkSync(filePath)
    }
  })

  test("wrong-shape but valid JSON is treated as corrupt (version + numeric fields)", () => {
    const prefix = `token-economy-shape-${Date.now()}`
    const filePath = join(tmpdir(), `${prefix}.json`)
    try {
      writeFileSync(filePath, JSON.stringify({ sessions: {}, total: {} }))
      const engine = new TokenEconomy.TokenEconomyEngine(filePath)
      expect(() => engine.status()).not.toThrow()
      expect(engine.status().total.requests).toBe(0)
    } finally {
      for (const name of readdirSync(tmpdir())) {
        if (name.startsWith(prefix)) rmSync(join(tmpdir(), name), { force: true })
      }
    }
  })

  test("env budget config rejects zero, negative and unsorted thresholds", () => {
    const cfg = TokenEconomy.loadBudgetConfig({
      TOKEN_ECONOMY_BUDGET_AGENT: "0",
      TOKEN_ECONOMY_BUDGET_SUBAGENT: "-5",
      TOKEN_ECONOMY_BUDGET_COMPACT_AT: "0.5",
    })
    expect(cfg.agent).toBe(TokenEconomy.DEFAULT_BUDGETS.agent)
    expect(cfg.subagent).toBe(TokenEconomy.DEFAULT_BUDGETS.subagent)
    expect(cfg.compact_at).toBe(0.5)

    const unsorted = TokenEconomy.loadBudgetConfig({
      TOKEN_ECONOMY_BUDGET_COMPACT_AT: "0.9",
      TOKEN_ECONOMY_BUDGET_FINALIZE_AT: "0.5",
    })
    expect(unsorted.compact_at).toBe(TokenEconomy.DEFAULT_THRESHOLDS.compact_at)
    expect(unsorted.finalize_at).toBe(TokenEconomy.DEFAULT_THRESHOLDS.finalize_at)
    expect(unsorted.hard_stop).toBe(TokenEconomy.DEFAULT_THRESHOLDS.hard_stop)
  })

  test("collector rejects tier-0 layers with volatile content", () => {
    const c = TokenEconomy.createContextCollector()
    expect(() =>
      c.add({ name: "rules", tier: 0, content: "current time is 12:00" }),
    ).toThrow(TokenEconomy.CacheOrderViolation)
  })

  test("validateStable catches PT-BR volatility markers", () => {
    expect(TokenEconomy.validateStable("atualizado hoje às 10:00")).toBe(false)
    expect(TokenEconomy.validateStable("regras do projeto")).toBe(true)
  })

  test("cache hit rate is 1.0 when only cached tokens are read", () => {
    const filePath = join(tmpdir(), `token-economy-cached-${Date.now()}.json`)
    try {
      const engine = new TokenEconomy.TokenEconomyEngine(filePath)
      engine.record("agent", 0, 0, 100)
      expect(engine.status().total.cache_hit_rate).toBe(1.0)
    } finally {
      unlinkSync(filePath)
    }
  })

  test("embedded newlines in bullets survive the compaction round-trip", () => {
    const state = {
      goal: "Meta",
      decisions: ["primeira linha\nsegunda linha com ## dentro"],
      files_changed: ["path.ts"],
      pending_tasks: [],
      blockers: [],
      next_step: "passo 1\npasso 2",
    }
    const md = TokenEconomy.createStructuredCompaction(state)
    const parsed = TokenEconomy.parseStructuredCompaction(md)
    expect(parsed.decisions[0]).toContain("primeira linha")
    expect(parsed.decisions[0]).toContain("segunda linha com ## dentro")
    expect(parsed.next_step).toContain("passo 1")
    expect(parsed.next_step).toContain("passo 2")
  })

  test("status returns clones, not live references", () => {
    const filePath = join(tmpdir(), `token-economy-clone-${Date.now()}.json`)
    try {
      const engine = new TokenEconomy.TokenEconomyEngine(filePath)
      engine.record("agent", 100, 0, 0)
      const st = engine.status()
      st.total.input_tokens = 999
      st.sessions["fake"] = st.total
      const fresh = engine.status()
      expect(fresh.total.input_tokens).toBe(100)
      expect(fresh.sessions["fake"]).toBeUndefined()
    } finally {
      unlinkSync(filePath)
    }
  })

  test("NaN input is sanitized and never corrupts the metrics file", () => {
    const filePath = join(tmpdir(), `token-economy-nan-${Date.now()}.json`)
    try {
      const engine = new TokenEconomy.TokenEconomyEngine(filePath)
      engine.record("session", Number.NaN, 10, 0)
      engine.record("session", Infinity, Number.NaN, -5) // negative cached also clamped
      const st = engine.status()
      expect(st.total.requests).toBe(2)
      expect(st.total.input_tokens).toBe(0)
      expect(st.total.output_tokens).toBe(10)
      expect(st.total.cached_read).toBe(0)
      // a second engine must be able to read the file back intact
      const engine2 = new TokenEconomy.TokenEconomyEngine(filePath)
      expect(engine2.status().total.requests).toBe(2)
    } finally {
      unlinkSync(filePath)
    }
  })

  test("checkBudget treats non-finite usage as a hard stop", () => {
    const stop = TokenEconomy.checkBudget("agent", Number.NaN)
    expect(stop.status).toBe("stop")
    expect(stop.ratio).toBe(1)
  })

  test("goal lines that look like markdown headers cannot split the artifact", () => {
    const state = {
      goal: "do X\n## Fake Section\nkeep me",
      decisions: [],
      files_changed: [],
      pending_tasks: [],
      blockers: [],
      next_step: "next",
    }
    const md = TokenEconomy.createStructuredCompaction(state)
    const parsed = TokenEconomy.parseStructuredCompaction(md)
    expect(parsed.goal).toContain("do X")
    expect(parsed.goal).toContain("keep me")
  })

  test("collector rejects invalid tier values at runtime", () => {
    const collector = TokenEconomy.createContextCollector()
    expect(() =>
      collector.add({ name: "bad", tier: Number.NaN as 0 | 1 | 2, content: "x" }),
    ).toThrow(TokenEconomy.CacheOrderViolation)
  })

  test("validateStable catches bare-time volatility in PT-BR and EN", () => {
    expect(TokenEconomy.validateStable("atualizado às 10:30")).toBe(false)
    expect(TokenEconomy.validateStable("updated at 9:15")).toBe(false)
    expect(TokenEconomy.validateStable("regras de formatação: 2 espaços")).toBe(true)
  })

  test("a directory at the metrics path is never renamed or touched", () => {
    const dir = join(tmpdir(), `token-economy-dir-${Date.now()}`)
    try {
      writeFileSync(join(dir, "keep.txt"), "keep") // create as dir first
    } catch {
      // already created below
    }
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir)
    try {
      const engine = new TokenEconomy.TokenEconomyEngine(dir)
      const st = engine.status() // must not throw
      expect(st.total.requests).toBe(0)
      expect(existsSync(`${dir}.corrupt-`)).toBe(false) // no rename of the dir
      const entries = readdirSync(dir)
      expect(entries.length).toBe(0) // dir untouched
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("concurrent engines writing to the same file merge without losing records", () => {
    const filePath = join(tmpdir(), `token-economy-concurrent-${Date.now()}.json`)
    try {
      const engineA = new TokenEconomy.TokenEconomyEngine(filePath)
      const engineB = new TokenEconomy.TokenEconomyEngine(filePath)
      engineA.record("agent", 100, 0, 0)
      engineB.record("agent", 200, 0, 0)
      const st = new TokenEconomy.TokenEconomyEngine(filePath).status()
      expect(st.total.requests).toBe(2)
      expect(st.total.input_tokens).toBe(300)
      expect(st.sessions["default"]?.input_tokens).toBe(300)
      // lock file must be released
      expect(existsSync(`${filePath}.lock`)).toBe(false)
    } finally {
      unlinkSync(filePath)
    }
  })

  test("symlinked metrics path is never read (no state adoption, no hang)", () => {
    const victim = join(tmpdir(), `token-economy-victim-${Date.now()}.json`)
    const link = join(tmpdir(), `token-economy-link-${Date.now()}.json`)
    try {
      writeFileSync(victim, JSON.stringify({ version: 1, sessions: { evil: { requests: 99, input_tokens: 99, output_tokens: 0, cached_read: 0, estimated_cost: 0, budget_breaches: 0, compactions: 0, cache_hit_rate: 0 } }, total: { requests: 99, input_tokens: 99, output_tokens: 0, cached_read: 0, estimated_cost: 0, budget_breaches: 0, compactions: 0, cache_hit_rate: 0 } }))
      symlinkSync(victim, link)
      const engine = new TokenEconomy.TokenEconomyEngine(link)
      const st = engine.status() // must not adopt attacker state
      expect(st.total.requests).toBe(0)
      // and the link itself is left untouched (no quarantine rename of symlinks)
      expect(linkExists(link)).toBe(true)
      expect(readFileSync(victim, "utf8")).toContain("evil")
    } finally {
      rmSync(victim, { force: true })
      rmSync(link, { force: true })
    }
  })

  test("session keys cannot pollute object prototypes", () => {
    const filePath = join(tmpdir(), `token-economy-proto-${Date.now()}.json`)
    try {
      const engine = new TokenEconomy.TokenEconomyEngine(filePath)
      engine.recordCompaction("__proto__")
      engine.recordCompaction("constructor")
      engine.record("agent", 5, 5, 0, "constructor")
      const st = engine.status()
      expect(st.total.compactions).toBe(2)
      expect(st.total.requests).toBe(1)
      // plain objects in this process must be untouched
      expect(({} as Record<string, unknown>).requests).toBeUndefined()
      expect(Object.prototype.hasOwnProperty.call(Object.prototype, "compactions")).toBe(false)
    } finally {
      unlinkSync(filePath)
    }
  })

  test("metrics file is written with mode 0600", () => {
    const filePath = join(tmpdir(), `token-economy-mode-${Date.now()}.json`)
    try {
      const engine = new TokenEconomy.TokenEconomyEngine(filePath)
      engine.record("agent", 1, 0, 0)
      const mode = statSync(filePath).mode & 0o777
      expect(mode).toBe(0o600)
    } finally {
      unlinkSync(filePath)
    }
  })

  test("hostile session keys are sanitized and bounded", () => {
    const filePath = join(tmpdir(), `token-economy-keys-${Date.now()}.json`)
    try {
      const engine = new TokenEconomy.TokenEconomyEngine(filePath)
      engine.record("agent", 1, 0, 0, "a b/c⚠️")
      engine.record("agent", 1, 0, 0, "k".repeat(500))
      const st = engine.status()
      expect(st.sessions["ab/c"]).toBeDefined() // invalid chars stripped, "/" kept
      const longKey = Object.keys(st.sessions).find((k) => k.startsWith("kk"))
      expect(longKey?.length).toBe(128)
    } finally {
      unlinkSync(filePath)
    }
  })

  test("absurd env cost cannot overflow the metrics file", () => {
    const previous = process.env.TOKEN_ECONOMY_COST_INPUT_PER_M
    const filePath = join(tmpdir(), `token-economy-cost-${Date.now()}.json`)
    try {
      process.env.TOKEN_ECONOMY_COST_INPUT_PER_M = "1e308"
      const engine = new TokenEconomy.TokenEconomyEngine(filePath)
      engine.record("agent", 1_000_000_000, 0, 0)
      const st = engine.status()
      expect(Number.isFinite(st.total.estimated_cost)).toBe(true)
      // file must still load in a fresh engine (no Infinity → quarantine loop)
      const engine2 = new TokenEconomy.TokenEconomyEngine(filePath)
      expect(engine2.status().total.requests).toBe(1)
    } finally {
      if (previous === undefined) delete process.env.TOKEN_ECONOMY_COST_INPUT_PER_M
      else process.env.TOKEN_ECONOMY_COST_INPUT_PER_M = previous
      unlinkSync(filePath)
    }
  })

  test("fresh HOME (missing parent dir) still persists metrics", () => {
    const dir = join(tmpdir(), `token-economy-deep-${Date.now()}`, "nested")
    const filePath = join(dir, "metrics.json")
    try {
      const engine = new TokenEconomy.TokenEconomyEngine(filePath)
      engine.record("agent", 1, 0, 0)
      expect(existsSync(filePath)).toBe(true)
      expect(new TokenEconomy.TokenEconomyEngine(filePath).status().total.requests).toBe(1)
    } finally {
      rmSync(join(tmpdir(), `token-economy-deep-${Date.now()}`), { recursive: true, force: true })
    }
  })

  test("all-zero thresholds fall back to defaults (no permanent hard stop)", () => {
    const previous = {
      compact: process.env.TOKEN_ECONOMY_BUDGET_COMPACT_AT,
      finalize: process.env.TOKEN_ECONOMY_BUDGET_FINALIZE_AT,
      stop: process.env.TOKEN_ECONOMY_BUDGET_HARD_STOP,
    }
    try {
      process.env.TOKEN_ECONOMY_BUDGET_COMPACT_AT = "0"
      process.env.TOKEN_ECONOMY_BUDGET_FINALIZE_AT = "0"
      process.env.TOKEN_ECONOMY_BUDGET_HARD_STOP = "0"
      const config = TokenEconomy.loadBudgetConfig()
      expect(config.compact_at).toBe(TokenEconomy.DEFAULT_THRESHOLDS.compact_at)
      expect(TokenEconomy.checkBudget("agent", 1, config).status).toBe("ok")
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[`TOKEN_ECONOMY_BUDGET_${key.toUpperCase()}_AT`]
        else process.env[`TOKEN_ECONOMY_BUDGET_${key.toUpperCase()}_AT`] = value
      }
    }
  })

  test("stale locks older than 5s are stolen instead of stalling writes", () => {
    const filePath = join(tmpdir(), `token-economy-lock-${Date.now()}.json`)
    const lockPath = `${filePath}.lock`
    try {
      const engine = new TokenEconomy.TokenEconomyEngine(filePath)
      writeFileSync(lockPath, "stale", { mode: 0o600 })
      const old = new Date(Date.now() - 60_000)
      utimesSync(lockPath, old, old)
      engine.record("agent", 7, 0, 0)
      expect(engine.status().total.requests).toBe(1)
      expect(existsSync(lockPath)).toBe(false)
    } finally {
      rmSync(lockPath, { force: true })
      unlinkSync(filePath)
    }
  })
})

function linkExists(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}