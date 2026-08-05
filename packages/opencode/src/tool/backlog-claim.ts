import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { Backlog } from "@opencode-ai/core/pipeline"
import { homedir } from "node:os"

export const Parameters = Schema.Struct({
  id: Schema.NonEmptyString,
})

type Metadata = {
  id: string
  title: string
  status: string
  claimedBy: string
}

const filePath = `${process.env.HOME ?? homedir()}/.opencode/backlog.json`

export const BacklogClaimTool = Tool.define<typeof Parameters, Metadata, never>(
  "backlog-claim",
  Effect.gen(function* () {
    return {
      description:
        "Use to claim a backlog item before working on it (prevents double work).",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const eng = new Backlog.BacklogEngine(filePath)
          const outcome = yield* Effect.promise(async () => {
            try {
              const item = await eng.claim(params.id, ctx.agent)
              return { ok: true as const, item }
            } catch (error) {
              return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
            }
          })
          if (!outcome.ok) {
            return {
              title: "Backlog Claim Failed",
              output: `Could not claim backlog item: ${outcome.error}`,
              metadata: { id: params.id, title: "", status: "", claimedBy: "" },
            }
          }
          return {
            title: "Backlog Item Claimed",
            output: `Claimed backlog item: ${outcome.item.title}`,
            metadata: {
              id: outcome.item.id,
              title: outcome.item.title,
              status: outcome.item.status,
              claimedBy: outcome.item.claimedBy ?? "",
            },
          }
        }),
    } satisfies Tool.DefWithoutID<typeof Parameters, Metadata>
  }),
)
