/** @jsxImportSource @opentui/solid */
import { createMemo, createSignal, For, Show, onMount } from "solid-js"
import { useTheme } from "../context/theme"
import { useSync } from "../context/sync"
import { useLocal } from "../context/local"
import { useRoute } from "../context/route"
import type { RGBA } from "@opentui/core"

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
  const sync = useSync()
  const local = useLocal()
  const route = useRoute()

  const currentAgent = createMemo(() => local.agent.current())
  const currentPhase = createMemo(() => {
    const a = currentAgent()
    return a ? AGENT_PHASE_MAP[a.name] : undefined
  })

  const phaseIdx = createMemo(() => {
    const p = currentPhase()
    return p ? PIPELINE.indexOf(p as typeof PIPELINE[number]) : -1
  })

  // Simulated quality scores (static for now, would come from QualityEngine)
  const quality = [
    { label: "Arch", score: 96, color: "success" as const },
    { label: "Back", score: 94, color: "success" as const },
    { label: "Front", score: 88, color: "warning" as const },
    { label: "Sec", score: 96, color: "success" as const },
  ]

  const toggleMission = () => {}
  const sessionCount = createMemo(() => sync.data.session.length)

  // Bar helper
  const bar = (pct: number, color: RGBA, w: number) => {
    const f = Math.max(1, Math.floor((pct / 100) * (w - 2)))
    const e = Math.max(0, w - 2 - f)
    return (
      <text>
        <text fg={color}>{"█".repeat(f)}</text>
        <text fg={theme.textMuted}>{"░".repeat(e)}</text>
        <text fg={theme.text}>{` ${pct}%`}</text>
      </text>
    )
  }

  const sel = (w: number) => Math.max(1, w - 4)

  return (
    <box flexShrink={0} gap={1} paddingRight={1}>
      {/* MISSION section */}
      <text fg={theme.primary}><b>MISSION</b></text>
      <Show when={currentPhase()}>
        <Show when={phaseIdx() >= 0}>
          {bar(Math.round(((phaseIdx() + 1) / PIPELINE.length) * 100), theme.primary, sel(props.width))}
        </Show>
      </Show>

      {/* Pipeline horizontal — compact, one line per phase */}
      <Show when={currentPhase()}>
        <text fg={theme.textMuted}>
          <For each={PIPELINE}>
            {(phase, i) => {
              const idx = phaseIdx()
              const c = i() < idx ? theme.success : i() === idx ? theme.primary : theme.textMuted
              const icon = i() < idx ? "▣" : i() === idx ? "◉" : "○"
              return (
                <span>
                  <span style={{ fg: c }}>{icon}</span>
                  <span style={{ fg: c }}>{PHASE_LABELS[phase]}</span>
                  {i() < PIPELINE.length - 1 ? <span> </span> : null}
                </span>
              )
            }}
          </For>
        </text>
      </Show>

      <text fg={theme.textMuted}>──────────────</text>

      {/* Agent status per pipeline phase */}
      <Show when={currentAgent()}>
        <text fg={theme.textMuted}>
          <For each={PIPELINE}>
            {(phase, i) => {
              const idx = phaseIdx()
              const agent = PHASE_AGENT[phase]
              const isDone = i() < idx
              const isCurrent = i() === idx
              const icon = isDone ? "▣" : isCurrent ? "◉" : "○"
              const c = isDone ? theme.success : isCurrent ? theme.primary : theme.textMuted
              return (
                <span>
                  <span style={{ fg: c }}>{icon}</span>
                  <span style={{ fg: isCurrent ? c : theme.textMuted }}>{agent.substring(0, 3)}</span>
                  {i() < PIPELINE.length - 1 ? <span> </span> : null}
                </span>
              )
            }}
          </For>
        </text>
      </Show>

      <text fg={theme.textMuted}>──────────────</text>

      {/* Quality compact */}
      <text fg={theme.textMuted}>
        <For each={quality}>
          {(q) => (
            <span>
              <span style={{ fg: theme[q.color] }}>{q.score}</span>
              <span style={{ fg: theme.textMuted }}>{q.label}</span>
              <span> </span>
            </span>
          )}
        </For>
      </text>

      <text fg={theme.textMuted}>──────────────</text>

      {/* Metrics row */}
      <text fg={theme.textMuted}>
        <span style={{ fg: theme.success }}>▣</span> Build
        <span> </span>
        <span style={{ fg: theme.textMuted }}>Cov 91%</span>
        <span> </span>
        <span style={{ fg: theme.info }}>Ctx 68%</span>
      </text>

      <text fg={theme.textMuted}>──────────────</text>

      {/* Next steps */}
      <text fg={theme.text}><b>Next</b></text>
      <Show when={phaseIdx() >= 0 && phaseIdx() < PIPELINE.length - 1}>
        <text fg={theme.secondary}>
          → {PHASE_AGENT[PIPELINE[Math.min(phaseIdx() + 1, PIPELINE.length - 1)]]}
        </text>
        <text fg={theme.textMuted}>
          → {PHASE_LABELS[PIPELINE[Math.min(phaseIdx() + 1, PIPELINE.length - 1)]]}
        </text>
      </Show>

      {/* Clickable phases: go to phase agent */}
      <text fg={theme.textMuted}>──────────────</text>
      <box flexDirection="row" gap={1} flexWrap="wrap">
        <For each={PIPELINE}>
          {(phase) => {
            const agent = PHASE_AGENT[phase]
            return (
              <box
                onMouseUp={() => agent && local.agent.set(agent)}
              >
                <text fg={theme.text}>{PHASE_LABELS[phase]}</text>
              </box>
            )
          }}
        </For>
      </box>
    </box>
  )
}
