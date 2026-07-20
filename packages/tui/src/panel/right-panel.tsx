/** @jsxImportSource @opentui/solid */
import { createMemo, For, Show, createSignal } from "solid-js"
import { useRoute } from "../context/route"
import { useSync } from "../context/sync"
import { useTheme } from "../context/theme"
import { useLocal } from "../context/local"
import { Locale } from "../util/locale"
import { getScrollAcceleration } from "../util/scroll"
import { useTuiConfig } from "../config"

type PipelinePhase =
  | "discovery"
  | "research"
  | "planning"
  | "architecture"
  | "debate"
  | "implementation"
  | "review"
  | "qa"
  | "security"
  | "self-critique"
  | "question"
  | "audit"
  | "delivery"

const PIPELINE_LABELS: Record<PipelinePhase, string> = {
  discovery: "Discovery",
  research: "Research",
  planning: "Planning",
  architecture: "Architecture",
  debate: "Debate",
  implementation: "Implementation",
  review: "Review",
  qa: "QA",
  security: "Security",
  "self-critique": "Self-Critique",
  question: "Question",
  audit: "Audit",
  delivery: "Delivery",
}

const PIPELINE_PHASES: PipelinePhase[] = [
  "discovery", "research", "planning", "architecture", "debate",
  "implementation", "review", "qa", "security",
  "self-critique", "question", "audit", "delivery",
]

// Map agent names to pipeline phases for automatic detection
const AGENT_PHASE_MAP: Record<string, PipelinePhase | undefined> = {
  auto: undefined,
  planner: "planning",
  po: "planning",
  ceo: "planning",
  architect: "architecture",
  cto: "architecture",
  qa: "qa",
  "qa-breaker": "qa",
  "code-reviewer": "review",
  "ux-reviewer": "review",
  "design-critic": "review",
  performance: "review",
  a11y: "review",
  security: "security",
  auditor: "audit",
  refactor: "implementation",
  documentation: "delivery",
  "release-manager": "delivery",
  teacher: "question",
  mentor: "question",
  questionador: "question",
}

export function RightPanel(props: { sessionID: string; width: number }) {
  const route = useRoute()
  const sync = useSync()
  const { theme } = useTheme()
  const local = useLocal()
  const tuiConfig = useTuiConfig()
  const scrollAcceleration = createMemo(() => getScrollAcceleration(tuiConfig))

  const [pipelineOpen, setPipelineOpen] = createSignal(true)
  const [sessionsOpen, setSessionsOpen] = createSignal(true)

  // Derive pipeline phase from current agent
  const pipelinePhase = createMemo<PipelinePhase | undefined>(() => {
    const agent = local.agent.current()
    if (!agent) return undefined
    return AGENT_PHASE_MAP[agent.name]
  })

  const sessions = createMemo(() =>
    sync.data.session
      .filter((x) => x.parentID === undefined)
      .toSorted((a, b) => b.time.updated - a.time.updated)
      .slice(0, 20),
  )

  const currentSessionID = createMemo(() =>
    route.data.type === "session" ? route.data.sessionID : undefined,
  )

  function navigateToSession(id: string) {
    route.navigate({ type: "session", sessionID: id })
  }

  const phaseColor = (phase: PipelinePhase) => {
    const current = pipelinePhase()
    if (!current) return theme.textMuted
    const currentIndex = PIPELINE_PHASES.indexOf(current)
    const phaseIndex = PIPELINE_PHASES.indexOf(phase)
    if (phaseIndex < currentIndex) return theme.success
    if (phaseIndex === currentIndex) return theme.primary
    return theme.textMuted
  }

  const phaseIcon = (phase: PipelinePhase) => {
    const current = pipelinePhase()
    if (!current) return "○"
    const currentIndex = PIPELINE_PHASES.indexOf(current)
    const phaseIndex = PIPELINE_PHASES.indexOf(phase)
    if (phaseIndex < currentIndex) return "✓"
    if (phaseIndex === currentIndex) return "●"
    return "○"
  }

  return (
    <box
      backgroundColor={theme.backgroundPanel}
      width={props.width}
      height="100%"
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={2}
      paddingRight={2}
    >
      <scrollbox
        flexGrow={1}
        scrollAcceleration={scrollAcceleration()}
        verticalScrollbarOptions={{
          trackOptions: {
            backgroundColor: theme.background,
            foregroundColor: theme.borderActive,
          },
        }}
      >
        <box flexShrink={0} gap={1} paddingRight={1}>

          <Show when={local.agent.current()}>
            {(agent) => (
              <box>
                <text fg={theme.text}>
                  <b>Agent Mode</b>
                </text>
                <text fg={local.agent.color(agent().name)}>
                  {agent().description ?? agent().name}
                </text>
              </box>
            )}
          </Show>

          <box>
            <box
              flexDirection="row"
              gap={1}
              onMouseDown={() => setSessionsOpen((x) => !x)}
            >
              <text fg={theme.text}>{sessionsOpen() ? "▼" : "▶"}</text>
              <text fg={theme.text}>
                <b>Sessions</b>
              </text>
              <text fg={theme.textMuted}>({sessions().length})</text>
            </box>
            <Show when={sessionsOpen()}>
              <For each={sessions()}>
                {(session) => {
                  const isCurrent = session.id === currentSessionID()
                  return (
                    <box
                      flexDirection="row"
                      gap={1}
                      backgroundColor={isCurrent ? theme.primary : undefined}
                      onMouseUp={() => navigateToSession(session.id)}
                    >
                      <text
                        fg={isCurrent ? theme.background : theme.text}
                        wrapMode="none"
                      >
                        {session.id.slice(0, 8)}
                      </text>
                      <text
                        fg={isCurrent ? theme.background : theme.textMuted}
                        wrapMode="none"
                        maxWidth={props.width - 20}
                      >
                        {Locale.truncate(session.title, Math.max(1, props.width - 20))}
                      </text>
                    </box>
                  )
                }}
              </For>
            </Show>
          </box>

          <box>
            <box
              flexDirection="row"
              gap={1}
              onMouseDown={() => setPipelineOpen((x) => !x)}
            >
              <text fg={theme.text}>{pipelineOpen() ? "▼" : "▶"}</text>
              <text fg={theme.text}>
                <b>Pipeline</b>
              </text>
            </box>
            <Show when={pipelineOpen()}>
              <For each={PIPELINE_PHASES}>
                {(phase) => (
                  <box flexDirection="row" gap={1}>
                    <text fg={phaseColor(phase)}>{phaseIcon(phase)}</text>
                    <text
                      fg={phaseColor(phase)}
                      wrapMode="none"
                      maxWidth={props.width - 4}
                    >
                      {PIPELINE_LABELS[phase]}
                    </text>
                  </box>
                )}
              </For>
            </Show>
          </box>
        </box>
      </scrollbox>
    </box>
  )
}
