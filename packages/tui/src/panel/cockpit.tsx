/** @jsxImportSource @opentui/solid */
import { createMemo, createSignal, For, Show, onMount } from "solid-js"
import { useTheme } from "../context/theme"
import { useLocal } from "../context/local"
import { useSync } from "../context/sync"
import { useRoute } from "../context/route"

const PIPELINE = [
  "discovery", "research", "planning", "architecture", "debate",
  "implementation", "review", "qa", "security",
  "self-critique", "question", "audit", "delivery",
] as const

const PHASE_LABELS: Record<string, string> = {
  discovery: "Disc", research: "Res", planning: "Plan",
  architecture: "Arch", debate: "Deb", implementation: "Impl",
  review: "Rev", qa: "QA", security: "Sec",
  "self-critique": "SC", question: "Q?", audit: "Audit", delivery: "Del",
}

const AGENT_PHASE_MAP: Record<string, string> = {
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

const PHASE_AGENT: Record<string, string> = {
  discovery: "explore", research: "general", planning: "planner",
  architecture: "architect", debate: "general", implementation: "general",
  review: "code-reviewer", qa: "qa", security: "security",
  "self-critique": "auditor", question: "questionador",
  audit: "auditor", delivery: "release-manager",
}

const PHASE_ICONS: Record<string, string> = {
  discovery: "🔍", research: "📚", planning: "📋",
  architecture: "🏗", debate: "🗣", implementation: "⚡",
  review: "👁", qa: "🧪", security: "🔒",
  "self-critique": "🔄", question: "❓",
  audit: "📊", delivery: "🚀",
}

type PhaseStatus = "pending" | "running" | "done" | "failed"

export function Cockpit(props: { width: number }) {
  const { theme } = useTheme()
  const local = useLocal()
  const sync = useSync()
  const route = useRoute()

  const sessionID = createMemo(() => 
    route.data.type === "session" ? route.data.sessionID : undefined
  )

  const pipelinePhaseFromTools = createMemo(() => {
    const sid = sessionID()
    if (!sid) return undefined
    const messages = sync.data.message[sid] ?? []
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role !== "assistant") continue
      const parts = sync.data.part[msg.id] ?? []
      for (let j = parts.length - 1; j >= 0; j--) {
        const part = parts[j]
        if (part.type === "tool" && (part as any).tool === "pipeline-advance") {
          // Input do tool: { phase, status } — detecta a fase em andamento
          try {
            const input = (part as any).state?.input
            const data = input ? JSON.parse(input) : null
            if (data?.phase) return data.phase
          } catch {}
          // Output do tool: JSON com currentPhase/phase — detecta após execução
          try {
            const output = (part as any).state?.output
            const data = output ? JSON.parse(output) : null
            if (data?.currentPhase) return data.currentPhase
            if (data?.phase) return data.phase
          } catch {}
        }
      }
    }
    return undefined
  })

  const currentAgent = createMemo(() => local.agent.current())
  const pipelinePhase = createMemo(() => {
    const fromTools = pipelinePhaseFromTools()
    if (fromTools) return fromTools
    const a = currentAgent()
    return a ? AGENT_PHASE_MAP[a.name] : undefined
  })

  const phaseIdx = createMemo(() => {
    const p = pipelinePhase()
    return p ? PIPELINE.indexOf(p as typeof PIPELINE[number]) : -1
  })

  const phaseStatus = (i: number): PhaseStatus => {
    const idx = phaseIdx()
    if (idx < 0) return "pending"
    if (i < idx) return "done"
    if (i === idx) return "running"
    return "pending"
  }

  const statusColor = (status: PhaseStatus) => {
    switch (status) {
      case "done": return theme.success
      case "running": return theme.warning
      case "failed": return theme.error
      default: return theme.textMuted
    }
  }

  const statusSymbol = (status: PhaseStatus) => {
    switch (status) {
      case "done": return "\u2713"
      case "running": return "\u25CF"
      case "failed": return "\u2715"
      default: return "\u25CB"
    }
  }

  const completedCount = createMemo(() => {
    const idx = phaseIdx()
    return idx < 0 ? 0 : idx
  })

  const bar = (pct: number, w: number) => {
    const filled = Math.max(1, Math.floor((pct / 100) * (w - 2)))
    const empty = Math.max(0, w - 2 - filled)
    return { filled: "\u2588".repeat(filled), empty: "\u2591".repeat(empty), pct }
  }

  const agentName = createMemo(() => currentAgent()?.name ?? "build")

  return (
    <box flexShrink={0} gap={1} paddingRight={1}>
      <text fg={theme.primary}><b>MISSION</b></text>

      <Show when={pipelinePhase() && phaseIdx() >= 0} fallback={
        <text fg={theme.textMuted}>Agent: {agentName()} — no active pipeline</text>
      }>
        <Show when={phaseIdx() >= 0}>
          {(() => {
            const b = bar(Math.round(((completedCount() + 1) / PIPELINE.length) * 100), Math.max(5, props.width - 6))
            return (
              <box flexDirection="row" gap={0}>
                <text fg={theme.primary}>{b.filled}</text>
                <text fg={theme.textMuted}>{b.empty}</text>
                <text fg={theme.text}>{` ${b.pct}%`}</text>
              </box>
            )
          })()}
        </Show>

        <text fg={theme.text}>
          {completedCount()}/{PIPELINE.length} etapas concluídas
        </text>

        <text fg={theme.textMuted}>{"\u2500".repeat(12)}</text>

        {PIPELINE.map((p, i) => {
          const st = phaseStatus(i)
          return (
            <box flexDirection="row" gap={1}>
              <text fg={statusColor(st)}>
                {statusSymbol(st)}
              </text>
              <text
                fg={statusColor(st)}
              >
                {PHASE_ICONS[p]} {PHASE_LABELS[p]}
              </text>
              <Show when={st === "running"}>
                <text fg={theme.textMuted}>({PHASE_AGENT[p] ?? agentName()})</text>
              </Show>
            </box>
          )
        })}

        <text fg={theme.textMuted}>{"\u2500".repeat(12)}</text>

        <Show when={phaseIdx() < PIPELINE.length - 1}>
          <text fg={theme.text}>Next: {PHASE_AGENT[PIPELINE[phaseIdx() + 1]]} ({PHASE_LABELS[PIPELINE[phaseIdx() + 1]]})</text>
        </Show>
      </Show>

      <text fg={theme.textMuted}>{"\u2500".repeat(14)}</text>
      <box flexDirection="row" gap={1} flexWrap="wrap">
        <For each={PIPELINE}>
          {(phase) => {
            const agent = PHASE_AGENT[phase]
            return (
              <box onMouseUp={() => agent && local.agent.set(agent)}>
                <text fg={theme.text}>{PHASE_LABELS[phase]}</text>
              </box>
            )
          }}
        </For>
      </box>
    </box>
  )
}
