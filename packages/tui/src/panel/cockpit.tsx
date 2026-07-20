/** @jsxImportSource @opentui/solid */
import { createMemo, For, Show } from "solid-js"
import { useTheme } from "../context/theme"
import { useLocal } from "../context/local"

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
  discovery: "auto", research: "auto", planning: "planner",
  architecture: "architect", debate: "auto", implementation: "auto",
  review: "code-reviewer", qa: "qa", security: "security",
  "self-critique": "auditor", question: "questionador",
  audit: "auditor", delivery: "release-manager",
}

export function Cockpit(props: { width: number }) {
  const { theme } = useTheme()
  const local = useLocal()

  const currentAgent = createMemo(() => local.agent.current())
  const currentPhase = createMemo(() => {
    const a = currentAgent()
    return a ? AGENT_PHASE_MAP[a.name] : undefined
  })

  const phaseIdx = createMemo(() => {
    const p = currentPhase()
    return p ? PIPELINE.indexOf(p as typeof PIPELINE[number]) : -1
  })

  const bar = (pct: number, w: number) => {
    const f = Math.max(1, Math.floor((pct / 100) * (w - 2)))
    const e = Math.max(0, w - 2 - f)
    return { filled: "\u2588".repeat(f), empty: "\u2591".repeat(e), pct }
  }

  const agentName = createMemo(() => currentAgent()?.name ?? "build")

  return (
    <box flexShrink={0} gap={1} paddingRight={1}>
      <text fg={theme.primary}><b>MISSION</b></text>

      <Show when={currentPhase() && phaseIdx() >= 0} fallback={
        <text fg={theme.textMuted}>Agent: {agentName()} — no active pipeline</text>
      }>
        {/* Progress bar — box with multiple text elements */}
        <Show when={phaseIdx() >= 0}>
          {(() => {
            const b = bar(Math.round(((phaseIdx() + 1) / PIPELINE.length) * 100), Math.max(5, props.width - 6))
            return (
              <box flexDirection="row" gap={0}>
                <text fg={theme.primary}>{b.filled}</text>
                <text fg={theme.textMuted}>{b.empty}</text>
                <text fg={theme.text}>{` ${b.pct}%`}</text>
              </box>
            )
          })()}
        </Show>

        {/* Pipeline indicator — plain text with separators */}
        <text fg={theme.textMuted}>
          {PIPELINE.map((p, i) => {
            const idx = phaseIdx()
            const icon = i < idx ? "\u25A3" : i === idx ? "\u25C9" : "\u25CB"
            return icon + PHASE_LABELS[p]
          }).join(" ")}
        </text>

        <text fg={theme.textMuted}>{"\u2500".repeat(12)}</text>

        {/* Agent per phase */}
        <text fg={theme.textMuted}>
          {PIPELINE.map((p, i) => {
            const idx = phaseIdx()
            const a = PHASE_AGENT[p]
            const icon = i < idx ? "\u25A3" : i === idx ? "\u25C9" : "\u25CB"
            return icon + a.substring(0, 3)
          }).join(" ")}
        </text>

        <text fg={theme.textMuted}>{"\u2500".repeat(12)}</text>

        {/* Next step */}
        <Show when={phaseIdx() < PIPELINE.length - 1}>
          <text fg={theme.text}>Next: {PHASE_AGENT[PIPELINE[phaseIdx() + 1]]} ({PHASE_LABELS[PIPELINE[phaseIdx() + 1]]})</text>
        </Show>
      </Show>

      {/* Clickable phase shortcuts */}
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
