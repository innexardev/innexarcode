import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { Templates } from "@opencode-ai/core/pipeline"

export const Parameters = Schema.Struct({
  template: Schema.NonEmptyString,
})

type Metadata = {
  id: string
  phases: number
  agents: string[]
}

export const TemplateStartTool = Tool.define<typeof Parameters, Metadata, never>(
  "template-start",
  Effect.gen(function* () {
    return {
      description:
        "Use when starting a new project or feature to see the pipeline plan for its project type (web, data, infra, product, mobile, api).",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          let tpl
          try {
            tpl = Templates.PipelineTemplates.get(params.template)
          } catch {
            const available = Templates.PipelineTemplates.list()
              .map((t) => t.id)
              .join(", ")
            return {
              title: "Unknown Template",
              output: `Unknown template: ${params.template}. Available: ${available}`,
              metadata: { id: params.template, phases: 0, agents: [] },
            }
          }
          const agents = [...new Set(tpl.phases.map((p) => p.agent))]
          const lines = [`Template: ${tpl.name} (${tpl.projectTypes.join(", ")})`]
          for (const phase of tpl.phases) {
            const gates = phase.gates.length > 0 ? ` [${phase.gates.join(", ")}]` : ""
            lines.push(`→ ${phase.name} (${phase.agent})${gates}`)
          }
          return {
            title: `Template: ${tpl.id}`,
            output: lines.join("\n"),
            metadata: { id: tpl.id, phases: tpl.phases.length, agents },
          }
        }),
    } satisfies Tool.DefWithoutID<typeof Parameters, Metadata>
  }),
)
