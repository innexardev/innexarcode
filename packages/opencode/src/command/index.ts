import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import path from "path"
import { InstanceState } from "@/effect/instance-state"
import { EffectBridge } from "@/effect/bridge"
import type { InstanceContext } from "@/project/instance-context"
import { Effect, Layer, Context, Schema } from "effect"
import { Config } from "@/config/config"
import { MCP } from "../mcp/mcp"
import { Skill } from "../skill"
import PROMPT_INITIALIZE from "./template/initialize.txt"
import PROMPT_REVIEW from "./template/review.txt"
import PROMPT_DISCOVER from "./template/discover.txt"
import PROMPT_EXPLORE from "./template/explore.txt"
import PROMPT_RESEARCH from "./template/research.txt"
import PROMPT_PLAN_CREATE from "./template/plan-create.txt"
import PROMPT_PLAN_REVIEW from "./template/plan-review.txt"
import PROMPT_DEBATE from "./template/debate.txt"
import PROMPT_SELF_CRITIQUE from "./template/self-critique.txt"
import PROMPT_ATTACH from "./template/attach.txt"
import PROMPT_PIPELINE from "./template/pipeline.txt"
import PROMPT_MISSION from "./template/mission.txt"
import PROMPT_PIPELINE_BUG from "./template/pipeline-bug.txt"
import PROMPT_PIPELINE_REVIEW from "./template/pipeline-review.txt"
import PROMPT_PIPELINE_REFACTOR from "./template/pipeline-refactor.txt"
import PROMPT_PIPELINE_UPGRADE from "./template/pipeline-upgrade.txt"
import PROMPT_PIPELINE_PERFORMANCE from "./template/pipeline-performance.txt"
import PROMPT_PIPELINE_SECURITY from "./template/pipeline-security.txt"
import PROMPT_PIPELINE_DEPLOY from "./template/pipeline-deploy.txt"
import PROMPT_PIPELINE_TESTING from "./template/pipeline-testing.txt"
import PROMPT_PIPELINE_DOCS from "./template/pipeline-docs.txt"
import PROMPT_AUDIT_REPORT from "./template/audit-report.txt"
import PROMPT_DELIVER from "./template/deliver.txt"
import { LegacyEvent } from "@opencode-ai/schema/legacy-event"

type State = {
  commands: Record<string, Info>
}

export const Event = {
  Executed: LegacyEvent.CommandExecuted,
}

export const Info = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  agent: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
  source: Schema.optional(Schema.Literals(["command", "mcp", "skill"])),
  // Some command templates are lazy promises from MCP prompt resolution.
  template: Schema.Unknown,
  subtask: Schema.optional(Schema.Boolean),
  hints: Schema.Array(Schema.String),
}).annotate({ identifier: "Command" })

export type Info = Omit<Schema.Schema.Type<typeof Info>, "template"> & { template: Promise<string> | string }

export function hints(template: string) {
  const result: string[] = []
  const numbered = template.match(/\$\d+/g)
  if (numbered) {
    for (const match of [...new Set(numbered)].sort()) result.push(match)
  }
  if (template.includes("$ARGUMENTS")) result.push("$ARGUMENTS")
  return result
}

export const Default = {
  INIT: "init",
  REVIEW: "review",
  DISCOVER: "discover",
  EXPLORE: "explore",
  RESEARCH: "research",
  PLAN_CREATE: "plan-create",
  PLAN_REVIEW: "plan-review",
  DEBATE: "debate",
  SELF_CRITIQUE: "self-critique",
  ATTACH: "attach",
  PIPELINE: "pipeline",
  MISSION: "mission",
  PIPELINE_BUG: "pipeline-bug",
  PIPELINE_REVIEW: "pipeline-review",
  PIPELINE_REFACTOR: "pipeline-refactor",
  PIPELINE_UPGRADE: "pipeline-upgrade",
  PIPELINE_PERFORMANCE: "pipeline-performance",
  PIPELINE_SECURITY: "pipeline-security",
  PIPELINE_DEPLOY: "pipeline-deploy",
  PIPELINE_TESTING: "pipeline-testing",
  PIPELINE_DOCS: "pipeline-docs",
  AUDIT_REPORT: "audit-report",
  DELIVER: "deliver",
} as const

export interface Interface {
  readonly get: (name: string) => Effect.Effect<Info | undefined>
  readonly list: () => Effect.Effect<Info[]>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Command") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const mcp = yield* MCP.Service
    const skill = yield* Skill.Service

    const init = Effect.fn("Command.state")(function* (ctx: InstanceContext) {
      const cfg = yield* config.get()
      const bridge = yield* EffectBridge.make()
      const commands: Record<string, Info> = {}

      commands[Default.INIT] = {
        name: Default.INIT,
        description: "guided AGENTS.md setup",
        source: "command",
        get template() {
          return PROMPT_INITIALIZE.replace("${path}", ctx.worktree)
        },
        hints: hints(PROMPT_INITIALIZE),
      }
      commands[Default.REVIEW] = {
        name: Default.REVIEW,
        description: "review changes [commit|branch|pr], defaults to uncommitted",
        source: "command",
        get template() {
          return PROMPT_REVIEW.replace("${path}", ctx.worktree)
        },
        subtask: true,
        hints: hints(PROMPT_REVIEW),
      }
      commands[Default.DISCOVER] = {
        name: Default.DISCOVER,
        description: "Engineering OS Discovery phase: scan project and save .opencode/project.json",
        source: "command",
        template: PROMPT_DISCOVER,
        subtask: true,
        hints: hints(PROMPT_DISCOVER),
      }
      commands[Default.EXPLORE] = {
        name: Default.EXPLORE,
        description: "Engineering OS Explore phase: navigate and map project file tree",
        source: "command",
        template: PROMPT_EXPLORE,
        subtask: true,
        hints: hints(PROMPT_EXPLORE),
      }
      commands[Default.RESEARCH] = {
        name: Default.RESEARCH,
        description: "Engineering OS Research phase: research APIs/frameworks before coding",
        source: "command",
        template: PROMPT_RESEARCH,
        subtask: true,
        hints: hints(PROMPT_RESEARCH),
      }
      commands[Default.PLAN_CREATE] = {
        name: Default.PLAN_CREATE,
        description: "Engineering OS Planning phase: create .opencode/plans/YYYY-MM-DD-task.md",
        source: "command",
        template: PROMPT_PLAN_CREATE,
        subtask: true,
        hints: hints(PROMPT_PLAN_CREATE),
      }
      commands[Default.PLAN_REVIEW] = {
        name: Default.PLAN_REVIEW,
        description: "Engineering OS Plan Review: review plan for completeness and risks",
        source: "command",
        template: PROMPT_PLAN_REVIEW,
        subtask: true,
        hints: hints(PROMPT_PLAN_REVIEW),
      }
      commands[Default.DEBATE] = {
        name: Default.DEBATE,
        description: "Engineering OS Debate phase: multi-agent review of proposal",
        source: "command",
        template: PROMPT_DEBATE,
        subtask: true,
        hints: hints(PROMPT_DEBATE),
      }
      commands[Default.AUDIT_REPORT] = {
        name: Default.AUDIT_REPORT,
        description: "Engineering OS Audit phase: comprehensive audit report with scorecard",
        source: "command",
        template: PROMPT_AUDIT_REPORT,
        subtask: true,
        hints: hints(PROMPT_AUDIT_REPORT),
      }
      commands[Default.DELIVER] = {
        name: Default.DELIVER,
        description: "Engineering OS Delivery phase: release checklist gate",
        source: "command",
        template: PROMPT_DELIVER,
        subtask: true,
        hints: hints(PROMPT_DELIVER),
      }
      commands[Default.SELF_CRITIQUE] = {
        name: Default.SELF_CRITIQUE,
        description: "Engineering OS Self-Critique: find incomplete, duplicated, dead, insecure code",
        source: "command",
        template: PROMPT_SELF_CRITIQUE,
        subtask: true,
        hints: hints(PROMPT_SELF_CRITIQUE),
      }
      commands[Default.ATTACH] = {
        name: Default.ATTACH,
        description: "Attach a file to the conversation (images, PDFs, text)",
        source: "command",
        template: PROMPT_ATTACH,
        subtask: true,
        hints: hints(PROMPT_ATTACH),
      }
      commands[Default.PIPELINE] = {
        name: Default.PIPELINE,
        description: "Run the complete Engineering OS pipeline (all 13 phases)",
        source: "command",
        template: PROMPT_PIPELINE,
        subtask: true,
        hints: hints(PROMPT_PIPELINE),
      }
      commands[Default.MISSION] = {
        name: Default.MISSION,
        description: "Detect mission type and run the appropriate pipeline",
        source: "command",
        template: PROMPT_MISSION,
        subtask: true,
        hints: hints(PROMPT_MISSION),
      }
      commands[Default.PIPELINE_BUG] = {
        name: Default.PIPELINE_BUG,
        description: "Bugfix pipeline: reproduce, analyze, fix, test, deliver",
        source: "command",
        template: PROMPT_PIPELINE_BUG,
        subtask: true,
        hints: hints(PROMPT_PIPELINE_BUG),
      }
      commands[Default.PIPELINE_REVIEW] = {
        name: Default.PIPELINE_REVIEW,
        description: "Code review pipeline: analyze architecture, backend, frontend, security, perf",
        source: "command",
        template: PROMPT_PIPELINE_REVIEW,
        subtask: true,
        hints: hints(PROMPT_PIPELINE_REVIEW),
      }
      commands[Default.PIPELINE_REFACTOR] = {
        name: Default.PIPELINE_REFACTOR,
        description: "Refactoring pipeline: map deps, detect smells, plan, execute, benchmark",
        source: "command",
        template: PROMPT_PIPELINE_REFACTOR,
        subtask: true,
        hints: hints(PROMPT_PIPELINE_REFACTOR),
      }
      commands[Default.PIPELINE_UPGRADE] = {
        name: Default.PIPELINE_UPGRADE,
        description: "Upgrade pipeline: research breaking changes, backup, upgrade, test",
        source: "command",
        template: PROMPT_PIPELINE_UPGRADE,
        subtask: true,
        hints: hints(PROMPT_PIPELINE_UPGRADE),
      }
      commands[Default.PIPELINE_PERFORMANCE] = {
        name: Default.PIPELINE_PERFORMANCE,
        description: "Performance pipeline: collect metrics, optimize, benchmark before/after",
        source: "command",
        template: PROMPT_PIPELINE_PERFORMANCE,
        subtask: true,
        hints: hints(PROMPT_PIPELINE_PERFORMANCE),
      }
      commands[Default.PIPELINE_SECURITY] = {
        name: Default.PIPELINE_SECURITY,
        description: "Security audit pipeline: OWASP, deps, secrets, JWT, CORS, XSS, CSRF",
        source: "command",
        template: PROMPT_PIPELINE_SECURITY,
        subtask: true,
        hints: hints(PROMPT_PIPELINE_SECURITY),
      }
      commands[Default.PIPELINE_DEPLOY] = {
        name: Default.PIPELINE_DEPLOY,
        description: "Deploy pipeline: verify build, tests, security, docker, release",
        source: "command",
        template: PROMPT_PIPELINE_DEPLOY,
        subtask: true,
        hints: hints(PROMPT_PIPELINE_DEPLOY),
      }
      commands[Default.PIPELINE_TESTING] = {
        name: Default.PIPELINE_TESTING,
        description: "Testing pipeline: analyze coverage, create tests, review, update CI",
        source: "command",
        template: PROMPT_PIPELINE_TESTING,
        subtask: true,
        hints: hints(PROMPT_PIPELINE_TESTING),
      }
      commands[Default.PIPELINE_DOCS] = {
        name: Default.PIPELINE_DOCS,
        description: "Documentation pipeline: README, API docs, diagrams, ADRs, changelog",
        source: "command",
        template: PROMPT_PIPELINE_DOCS,
        subtask: true,
        hints: hints(PROMPT_PIPELINE_DOCS),
      }

      for (const [name, command] of Object.entries(cfg.command ?? {})) {
        commands[name] = {
          name,
          agent: command.agent,
          model: command.model,
          description: command.description,
          source: "command",
          get template() {
            return command.template
          },
          subtask: command.subtask,
          hints: hints(command.template),
        }
      }

      for (const [name, prompt] of Object.entries(yield* mcp.prompts())) {
        commands[name] = {
          name,
          source: "mcp",
          description: prompt.description,
          get template() {
            return bridge.promise(
              mcp
                .getPrompt(
                  prompt.client,
                  prompt.name,
                  prompt.arguments
                    ? Object.fromEntries(prompt.arguments.map((argument, i) => [argument.name, `$${i + 1}`]))
                    : {},
                )
                .pipe(
                  Effect.map(
                    (template) =>
                      template?.messages
                        .map((message) => (message.content.type === "text" ? message.content.text : ""))
                        .join("\n") || "",
                  ),
                ),
            )
          },
          hints: prompt.arguments?.map((_, i) => `$${i + 1}`) ?? [],
        }
      }

      for (const item of yield* skill.all()) {
        if (commands[item.name]) continue
        const dir = item.location === "<built-in>" ? undefined : path.dirname(item.location)
        commands[item.name] = {
          name: item.name,
          description: item.description,
          source: "skill",
          get template() {
            if (!dir) return item.content
            return [
              item.content,
              "",
              `Base directory for this skill: ${dir}`,
              "Relative paths in this skill (e.g., scripts/, references/) are relative to this base directory.",
            ].join("\n")
          },
          hints: [],
        }
      }

      return {
        commands,
      }
    })

    const state = yield* InstanceState.make<State>((ctx) => init(ctx))

    const get = Effect.fn("Command.get")(function* (name: string) {
      const s = yield* InstanceState.get(state)
      return s.commands[name]
    })

    const list = Effect.fn("Command.list")(function* () {
      const s = yield* InstanceState.get(state)
      return Object.values(s.commands)
    })

    return Service.of({ get, list })
  }),
)

export const node = LayerNode.make({ service: Service, layer: layer, deps: [Config.node, MCP.node, Skill.node] })

export * as Command from "."
