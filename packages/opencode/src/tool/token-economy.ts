import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { TokenEconomy } from "@opencode-ai/core/pipeline"

export const Parameters = Schema.Struct({
  command: Schema.Literals(["status", "compact"]),
  session: Schema.optional(Schema.String),
  verbose: Schema.optional(Schema.Boolean).annotate({
    description: "Include the full per-session dump instead of the aggregate summary",
  }),
})

type Metadata = {
  requests: number
  estimated_cost: number
  cache_hit_rate: number
  compactions: number
}

export const TokenEconomyTool = Tool.define<typeof Parameters, Metadata, never>(
  "tokenEconomy",
  Effect.gen(function* () {
    return {
      description:
        "Report or act on the token economy: per-level budget usage (session/agent/subagent) from persistent metrics, or record a compaction after compacting context. status returns an aggregate summary (totals + top-5 sessions by usage); pass verbose=true for the full per-session dump. Use to keep long sessions inside budget: run status before continuing, run compact after condensing context.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, _ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const engine = new TokenEconomy.TokenEconomyEngine()
          const st = engine.status()
          // Own-property lookup only: untrusted keys like "toString"/"constructor" must
          // never fall through the prototype chain and produce a NaN-based false stop.
          const metrics =
            params.session && Object.hasOwn(st.sessions, params.session)
              ? st.sessions[params.session]
              : st.total
          const suffix = params.session ? ` (session: ${params.session})` : ""
          if (params.command === "compact") {
            engine.recordCompaction(params.session ?? "default")
            return {
              title: `Token Economy — compactação registrada${suffix}`,
              output:
                "Compactação registrada. Na próxima mensagem, entregue o resumo estruturado " +
                "(cabeçalhos: Objective / Important Details / Work State / Next Move / Relevant Files).",
              metadata: {
                requests: metrics.requests,
                estimated_cost: metrics.estimated_cost,
                cache_hit_rate: metrics.cache_hit_rate,
                compactions: metrics.compactions,
              },
            }
          }
          const config = TokenEconomy.loadBudgetConfig()
          const used = TokenEconomy.cumulativeTokens(metrics)
          const lines = TokenEconomy.BUDGET_LEVELS.map((level) => {
            const check = TokenEconomy.checkBudget(level, used, config)
            return `${level}: ${Math.round(check.ratio * 100)}% (${check.status}) — ${check.recommendedAction}`
          })
          const budgetLines = lines.join("\n")
          if (params.verbose) {
            return {
              title: `Token Economy — status (full dump)${suffix}`,
              output: JSON.stringify(st, null, 2) + "\n\n" + budgetLines,
              metadata: {
                requests: metrics.requests,
                estimated_cost: metrics.estimated_cost,
                cache_hit_rate: metrics.cache_hit_rate,
                compactions: metrics.compactions,
              },
            }
          }
          const summary = {
            version: st.version,
            sessionCount: Object.keys(st.sessions).length,
            total: st.total,
            topSessions: Object.entries(st.sessions)
              .map(([session, m]) => ({
                session,
                tokens: TokenEconomy.cumulativeTokens(m),
                requests: m.requests,
                estimated_cost: m.estimated_cost,
              }))
              .toSorted((a, b) => b.tokens - a.tokens)
              .slice(0, 5),
          }
          return {
            title: `Token Economy — status${suffix}`,
            output: JSON.stringify(summary, null, 2) + "\n\n" + budgetLines,
            metadata: {
              requests: metrics.requests,
              estimated_cost: metrics.estimated_cost,
              cache_hit_rate: metrics.cache_hit_rate,
              compactions: metrics.compactions,
            },
          }
        }),
    } satisfies Tool.DefWithoutID<typeof Parameters, Metadata>
  }),
)