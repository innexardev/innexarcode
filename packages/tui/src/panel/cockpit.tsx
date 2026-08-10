/** @jsxImportSource @opentui/solid */
import { createMemo, For, Show } from "solid-js"
import { useTheme } from "../context/theme"
import { useLocal } from "../context/local"
import { usePipeline } from "../context/pipeline"
import { useProject } from "../context/project"

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
  const pipeline = usePipeline()
  const project = useProject()

  // Workspace dono do pipeline vs workspace atual
  const currentWorkspace = createMemo(() => project.workspace.current() ?? project.instance.directory() ?? process.cwd())
  const pipelineWorkspace = createMemo(() => pipeline.workspace)
  const isOtherProject = createMemo(() => {
    const pw = pipelineWorkspace()
    const cw = currentWorkspace()
    if (!pw) return false
    return pw !== cw
  })

  const currentAgent = createMemo(() => local.agent.current())

  // Fase real: pipeline state machine (arquivo) > agente ativo
  const pipelinePhase = createMemo(() => {
    const s = pipeline.status
    if (!s) return undefined
    if (s.currentPhase) return s.currentPhase
    // sem fase ativa mas com fases completas — pipeline pausado/concluído
    if (s.completedPhases.length > 0) return undefined
    const a = currentAgent()
    return a ? a.name : undefined
  })

  const phaseIdx = createMemo(() => {
    const p = pipelinePhase()
    if (p && PIPELINE.includes(p as (typeof PIPELINE)[number])) {
      return PIPELINE.indexOf(p as (typeof PIPELINE)[number])
    }
    // nenhuma fase ativa: se há completadas, aponta para a próxima pendente
    const done = pipeline.completedPhases.length
    if (done > 0 && done < PIPELINE.length) return done
    return -1
  })

  const phaseStatus = (i: number): PhaseStatus => {
    const phase = PIPELINE[i]
    if (pipeline.isFailed(phase)) return "failed"
    if (pipeline.hasPhase(phase)) return "done"
    if (pipeline.isRunning(phase)) return "running"
    const idx = phaseIdx()
    if (idx >= 0 && i === idx) return "running"
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
    const s = pipeline.status
    return s ? s.completedPhases.filter((p) => PIPELINE.includes(p as (typeof PIPELINE)[number])).length : 0
  })

  const bar = (pct: number, w: number) => {
    const filled = Math.max(1, Math.floor((pct / 100) * (w - 2)))
    const empty = Math.max(0, w - 2 - filled)
    return { filled: "\u2588".repeat(filled), empty: "\u2591".repeat(empty), pct }
  }

  const agentName = createMemo(() => currentAgent()?.name ?? "build")
  const hasPipeline = createMemo(() => (pipeline.status?.completedPhases.length ?? 0) > 0 || pipeline.currentPhase !== null)

  return (
    <box flexShrink={0} gap={1} paddingRight={1}>
      <text fg={theme.primary}><b>MISSION</b></text>

      <Show when={isOtherProject()}>
        <text fg={theme.error}>Pipeline de outro projeto: {pipelineWorkspace()}</text>
      </Show>

      <Show when={hasPipeline()} fallback={
        <text fg={theme.textMuted}>Agent: {agentName()} — no active pipeline</text>
      }>
        <Show when={phaseIdx() >= 0 || completedCount() > 0}>
          {(() => {
            const pct = Math.round((completedCount() / PIPELINE.length) * 100)
            const b = bar(pct, Math.max(5, props.width - 6))
            return (
              <box flexDirection="row" gap={0}>
                <text fg={theme.primary}>{b.filled}</text>
                <text fg={theme.textMuted}>{b.empty}</text>
                <text fg={theme.text}>{` ${pct}%`}</text>
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
              <text fg={statusColor(st)}>
                {PHASE_ICONS[p]} {PHASE_LABELS[p]}
              </text>
              <Show when={st === "running"}>
                <text fg={theme.textMuted}>({PHASE_AGENT[p] ?? agentName()})</text>
              </Show>
            </box>
          )
        })}

        <text fg={theme.textMuted}>{"\u2500".repeat(12)}</text>

        <Show when={phaseIdx() >= 0 && phaseIdx() < PIPELINE.length - 1}>
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