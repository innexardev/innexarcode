/** @jsxImportSource @opentui/solid */
import { createMemo, For, Show } from "solid-js"
import { useTheme } from "../context/theme"
import { useSync } from "../context/sync"
import { useLocal } from "../context/local"
import type { RGBA } from "@opentui/core"

// 13 pipeline phases
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

/** Health metric category */
interface HealthMetric {
  label: string
  percent: number
  color: RGBA
}

/** Agent work status */
interface AgentStatus {
  name: string
  color: RGBA
  status: "idle" | "working" | "done" | "error"
  progress?: number
}

/**
 * Mission Control — shows overall project health, agent activity, and pipeline progress.
 * Designed to be embedded in the right panel or as a standalone view.
 */
export function MissionControl(props: { width: number }) {
  const { theme } = useTheme()
  const sync = useSync()
  const local = useLocal()

  // Derive agent status from available agents
  const agentStatuses = createMemo<AgentStatus[]>(() => {
    const allAgents = sync.data.agent
    const current = local.agent.current()
    return allAgents
      .filter((a) => !a.hidden)
      .slice(0, 10)
      .map((a) => ({
        name: a.name,
        color: local.agent.color(a.name),
        status: current?.name === a.name ? "working" : "idle",
        progress: current?.name === a.name ? 50 : undefined,
      }))
  })

  // Health metrics (simulated from available data)
  const healthMetrics = createMemo<HealthMetric[]>(() => {
    const agentCount = sync.data.agent.filter((a) => !a.hidden).length
    const sessionCount = sync.data.session.filter((s) => s.parentID === undefined).length
    return [
      { label: "Agents", percent: Math.min(100, (agentCount / 25) * 100), color: theme.primary },
      { label: "Sessions", percent: Math.min(100, (sessionCount / 20) * 100), color: theme.success },
      { label: "Pipeline", percent: 40, color: theme.warning },
    ]
  })

  // Current pipeline phase from active agent
  const currentPhaseIndex = createMemo(() => {
    const agent = local.agent.current()
    if (!agent) return -1
    // Map agent name to pipeline phase
    const phaseMap: Record<string, string> = {
      planner: "planning", po: "planning", ceo: "planning",
      architect: "architecture", cto: "architecture",
      qa: "qa", "qa-breaker": "qa",
      "code-reviewer": "review", "ux-reviewer": "review",
      "design-critic": "review", performance: "review", a11y: "review",
      security: "security", auditor: "audit",
      refactor: "implementation", documentation: "delivery",
      "release-manager": "delivery", teacher: "question",
      mentor: "question", questionador: "question",
    }
    const phase = phaseMap[agent.name]
    if (!phase) return -1
    return PHASES.indexOf(phase as typeof PHASES[number])
  })

  const bar = (pct: number, color: RGBA, w: number) => {
    const filled = Math.max(1, Math.floor((pct / 100) * (w - 2)))
    const empty = Math.max(0, w - 2 - filled)
    return (
      <text>
        <text fg={color}>{"█".repeat(filled)}</text>
        <text fg={theme.textMuted}>{"░".repeat(empty)}</text>
        <text fg={theme.text}>{` ${pct}%`}</text>
      </text>
    )
  }

  return (
    <box flexShrink={0} gap={1} paddingRight={1}>
      {/* Header */}
      <text fg={theme.text}>
        <b>Mission Control</b>
      </text>

      {/* Health Radar */}
      <text fg={theme.textMuted}>── Health ──</text>
      <For each={healthMetrics()}>
        {(m) => (
          <box flexDirection="row" gap={1}>
            <text fg={theme.textMuted} wrapMode="none" maxWidth={10}>
              {m.label}
            </text>
            <Show when={props.width > 20}>
              {bar(m.percent, m.color, Math.max(5, props.width - 18))}
            </Show>
          </box>
        )}
      </For>

      {/* Pipeline Progress */}
      <text fg={theme.textMuted}>── Pipeline ──</text>
      <Show when={currentPhaseIndex() >= 0}>
        <For each={PHASES}>
          {(phase, i) => {
            const idx = currentPhaseIndex()
            const fg = i() < idx ? theme.success : i() === idx ? theme.primary : theme.textMuted
            const icon = i() < idx ? "✓" : i() === idx ? "●" : "○"
            return (
              <text fg={fg} wrapMode="none" maxWidth={props.width - 2}>
                {icon} {PHASE_LABELS[phase]}
              </text>
            )
          }}
        </For>
      </Show>
      <Show when={currentPhaseIndex() < 0}>
        <text fg={theme.textMuted}>No active pipeline</text>
      </Show>

      {/* Agent Activity */}
      <text fg={theme.textMuted}>── Agents ──</text>
      <For each={agentStatuses()}>
        {(a) => (
          <box flexDirection="row" gap={1}>
            <text fg={a.color}>
              {a.status === "working" ? "▶" : a.status === "done" ? "✓" : "○"}
            </text>
            <text fg={a.status === "working" ? a.color : theme.textMuted} wrapMode="none" maxWidth={props.width - 6}>
              {a.name}
            </text>
          </box>
        )}
      </For>
    </box>
  )
}
