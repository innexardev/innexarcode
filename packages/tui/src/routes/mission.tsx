/** @jsxImportSource @opentui/solid */
import { createMemo, For, Show } from "solid-js"
import { useTheme } from "../context/theme"
import { useSync } from "../context/sync"
import { useLocal } from "../context/local"
import { useRoute } from "../context/route"
import { useBindings } from "../keymap"
import { useTerminalDimensions } from "@opentui/solid"
import type { RGBA } from "@opentui/core"

const PHASES = [
  "discovery", "research", "planning", "architecture", "debate",
  "implementation", "review", "qa", "security",
  "self-critique", "question", "audit", "delivery",
] as const

const PHASE_LABELS: Record<string, string> = {
  discovery: "Discovery", research: "Research", planning: "Planning",
  architecture: "Architecture", debate: "Debate", implementation: "Implementation",
  review: "Review", qa: "QA", security: "Security",
  "self-critique": "Self-Critique", question: "Question",
  audit: "Audit", delivery: "Delivery",
}

const AGENT_PHASE_MAP: Record<string, string | undefined> = {
  auto: undefined, planner: "planning", po: "planning", ceo: "planning",
  architect: "architecture", cto: "architecture",
  qa: "qa", "qa-breaker": "qa",
  "code-reviewer": "review", "ux-reviewer": "review",
  "design-critic": "review", performance: "review", a11y: "review",
  security: "security", auditor: "audit",
  refactor: "implementation", documentation: "delivery",
  "release-manager": "delivery", teacher: "question",
  mentor: "question", questionador: "question",
}

interface HealthMetric {
  label: string
  percent: number
  color: RGBA
}

interface AgentStatus {
  name: string
  color: RGBA
  status: "idle" | "working" | "done" | "error"
  progress?: number
}

export function MissionView() {
  const { theme } = useTheme()
  const sync = useSync()
  const local = useLocal()
  const route = useRoute()
  const dimensions = useTerminalDimensions()

  useBindings(() => ({
    bindings: [
      { key: "escape", desc: "Back to home", group: "Mission", cmd: () => route.navigate({ type: "home" }) },
    ],
  }))

  const currentAgent = createMemo(() => local.agent.current())

  const agentStatuses = createMemo<AgentStatus[]>(() => {
    const allAgents = sync.data.agent
    const current = currentAgent()
    return allAgents
      .filter((a) => !a.hidden)
      .slice(0, 15)
      .map((a) => ({
        name: a.name,
        color: local.agent.color(a.name),
        status: current?.name === a.name ? "working" : "idle",
        progress: current?.name === a.name ? 50 : undefined,
      }))
  })

  const healthMetrics = createMemo<HealthMetric[]>(() => {
    const agentCount = sync.data.agent.filter((a) => !a.hidden).length
    const sessionCount = sync.data.session.filter((s) => s.parentID === undefined).length
    return [
      { label: "Agents", percent: Math.min(100, (agentCount / 25) * 100), color: theme.primary },
      { label: "Sessions", percent: Math.min(100, (sessionCount / 20) * 100), color: theme.success },
      { label: "Pipeline", percent: currentAgent() ? 40 : 0, color: theme.warning },
      { label: "Coverage", percent: 0, color: theme.error },
    ]
  })

  const currentPhaseIndex = createMemo(() => {
    const agent = currentAgent()
    if (!agent) return -1
    const phase = AGENT_PHASE_MAP[agent.name]
    if (!phase) return -1
    return PHASES.indexOf(phase as typeof PHASES[number])
  })

  const bar = (pct: number, color: RGBA, w: number) => {
    const filled = Math.max(1, Math.floor((pct / 100) * w))
    const empty = Math.max(0, w - filled)
    return (
      <text>
        <text fg={color}>{"█".repeat(filled)}</text>
        <text fg={theme.textMuted}>{"░".repeat(empty)}</text>
        <text fg={theme.text}>{` ${Math.round(pct)}%`}</text>
      </text>
    )
  }

  const panelWidth = createMemo(() => Math.floor((dimensions().width - 6) / 2))

  return (
    <box
      width={dimensions().width}
      height={dimensions().height}
      flexDirection="column"
      backgroundColor={theme.background}
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
      gap={1}
    >
      <box flexDirection="row" justifyContent="space-between" paddingBottom={1}>
        <text fg={theme.text}>
          <b>Mission Control</b>
        </text>
        <text fg={theme.textMuted}>ESC to go back</text>
      </box>

      <box flexDirection="row" gap={2} flexGrow={1} minHeight={0}>
        <box flexDirection="column" gap={1} width={panelWidth()} paddingRight={1}>
          <text fg={theme.textMuted}>── Health Radar ──</text>
          <For each={healthMetrics()}>
            {(m) => (
              <box flexDirection="row" gap={1}>
                <text fg={theme.textMuted} wrapMode="none" maxWidth={10}>
                  {m.label}
                </text>
                {bar(m.percent, m.color, Math.max(5, panelWidth() - 18))}
              </box>
            )}
          </For>

          <text fg={theme.textMuted} paddingTop={1}>── Agent Activity ──</text>
          <For each={agentStatuses()}>
            {(a) => (
              <box flexDirection="row" gap={1}>
                <text fg={a.color}>
                  {a.status === "working" ? "▶" : a.status === "done" ? "✓" : "○"}
                </text>
                <text fg={a.status === "working" ? a.color : theme.textMuted} wrapMode="none">
                  {a.name}
                </text>
                <Show when={a.status === "working"}>
                  <text fg={theme.warning}>...</text>
                </Show>
              </box>
            )}
          </For>
        </box>

        <box flexDirection="column" gap={1} width={panelWidth()}>
          <text fg={theme.textMuted}>── Pipeline Progress ──</text>
          <Show when={currentPhaseIndex() < 0}>
            <text fg={theme.textMuted}>No active pipeline — select an agent to begin.</text>
          </Show>
          <Show when={currentPhaseIndex() >= 0}>
            <For each={PHASES}>
              {(phase, i) => {
                const idx = currentPhaseIndex()
                const complete = i() < idx
                const current = i() === idx
                const fg = complete ? theme.success : current ? theme.primary : theme.textMuted
                const icon = complete ? "✓" : current ? "●" : "○"
                return (
                  <box flexDirection="row" gap={1}>
                    <text fg={fg}>{icon}</text>
                    <text fg={fg} wrapMode="none">
                      {PHASE_LABELS[phase]}
                    </text>
                    <Show when={current}>
                      <text fg={theme.warning}>(active)</text>
                    </Show>
                  </box>
                )
              }}
            </For>
          </Show>
        </box>
      </box>

      <box paddingTop={1}>
        <text fg={theme.textMuted}>
          M: Mission Control · ESC: Go back · Ctrl+P: Command Palette
        </text>
      </box>
    </box>
  )
}
