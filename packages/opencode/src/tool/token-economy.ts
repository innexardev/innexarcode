import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { TokenEconomy } from "@opencode-ai/core/pipeline"

export const Parameters = Schema.Struct({
  command: Schema.Literals(["status", "compact"]),
  session: Schema.optional(Schema.String),
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
        "Report or act on the token economy: per-level budget usage (session/agent/subagent) from persistent metrics, or record a compaction after compacting context. Use to keep long sessions inside budget: run status before continuing, run compact after condensing context.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, _ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const engine = new TokenEconomy.TokenEconomyEngine()
          const st = engine.status()
          const metrics = params.session ? st.sessions[params.session] ?? st.total : st.total
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
          return {
            title: `Token Economy — status${suffix}`,
            output: JSON.stringify(st, null, 2) + "\n\n" + lines.join("\n"),
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