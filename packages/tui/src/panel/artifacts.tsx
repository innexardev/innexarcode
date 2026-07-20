/** @jsxImportSource @opentui/solid */
import { createMemo, createSignal, For, Show } from "solid-js"
import { useTheme } from "../context/theme"
import { useTuiConfig } from "../config"
import { getScrollAcceleration } from "../util/scroll"
import { Locale } from "../util/locale"

export interface ArtifactItem {
  id: string
  title: string
  type: string
  language?: string
  size: number
  lines: number
  tokens: number
  preview: string
}

interface ArtifactPanelProps {
  width: number
  artifacts: ArtifactItem[]
  onSelect?: (id: string) => void
  onRemove?: (id: string) => void
  selectedId?: string
}

const TYPE_ICONS: Record<string, string> = {
  code: "📄",
  log: "📋",
  data: "📋",
  json: "📋",
  sql: "🗄",
  markdown: "📝",
  text: "📄",
  image: "🖼",
  diff: "📊",
  csv: "📊",
  yaml: "📋",
  config: "⚙",
}

const TYPE_GROUPS: Record<string, string> = {
  code: "Code",
  log: "Logs",
  sql: "Data",
  json: "Data",
  data: "Data",
  markdown: "Docs",
  text: "Text",
  image: "Media",
  diff: "Diffs",
  csv: "Data",
  yaml: "Config",
  config: "Config",
}

function iconForType(type: string): string {
  return TYPE_ICONS[type] ?? "📄"
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB"
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + " KB"
  return bytes + " B"
}

function groupLabel(type: string): string {
  return TYPE_GROUPS[type] ?? "Other"
}

export function ArtifactPanel(props: ArtifactPanelProps) {
  const { theme } = useTheme()
  const tuiConfig = useTuiConfig()
  const scrollAcceleration = createMemo(() => getScrollAcceleration(tuiConfig))
  const [panelOpen, setPanelOpen] = createSignal(true)
  const [filter, setFilter] = createSignal("")

  const filtered = createMemo(() => {
    const q = filter().toLowerCase()
    if (!q) return props.artifacts
    return props.artifacts.filter((a) => a.title.toLowerCase().includes(q))
  })

  const grouped = createMemo(() => {
    const groups: Record<string, ArtifactItem[]> = {}
    for (const item of filtered()) {
      const key = groupLabel(item.type)
      if (!groups[key]) groups[key] = []
      groups[key].push(item)
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  })

  const count = () => props.artifacts.length

  const lastId = createMemo(() => {
    const items = props.artifacts
    return items.length > 0 ? items[items.length - 1].id : undefined
  })

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
      <box flexShrink={0} gap={1} flexDirection="row" onMouseDown={() => setPanelOpen((x) => !x)}>
        <text fg={theme.text}>{panelOpen() ? "▼" : "▶"}</text>
        <text fg={theme.text}>
          <b>Artifacts</b>
        </text>
        <text fg={theme.textMuted}>({count()})</text>
      </box>

      <Show when={panelOpen()}>
        <box gap={1} flexShrink={0}>
          <box
            backgroundColor={theme.background}
            paddingLeft={1}
            paddingRight={1}
          >
            <text fg={theme.textMuted}>🔍 Filtrar artefatos...</text>
          </box>

          <Show
            when={filtered().length > 0}
            fallback={
              <text fg={theme.textMuted}>Nenhum artefato</text>
            }
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
                <For each={grouped()}>
                  {([label, items]) => (
                    <box gap={1}>
                      <text fg={theme.textMuted}>
                        ── {label} ──
                      </text>
                      <For each={items}>
                        {(artifact) => {
                          const isSelected = artifact.id === props.selectedId
                          const line = `⚡${Locale.number(artifact.tokens)} tokens`
                          const size = formatBytes(artifact.size)

                          return (
                            <box
                              flexDirection="row"
                              gap={1}
                              backgroundColor={isSelected ? theme.primary : undefined}
                              onMouseUp={() => props.onSelect?.(artifact.id)}
                            >
                              <box flexDirection="column" flexGrow={1}>
                                <box flexDirection="row" gap={1}>
                                  <text fg={isSelected ? theme.background : theme.text}>
                                    {iconForType(artifact.type)}
                                  </text>
                                  <text
                                    fg={isSelected ? theme.background : theme.text}
                                    wrapMode="none"
                                    maxWidth={props.width - 10}
                                  >
                                    {Locale.truncate(artifact.title, Math.max(1, props.width - 10))}
                                  </text>
                                </box>
                                <box flexDirection="row" gap={1}>
                                  <text fg={isSelected ? theme.background : theme.textMuted}>
                                    {size}
                                  </text>
                                  <text fg={isSelected ? theme.background : theme.textMuted}>
                                    ·
                                  </text>
                                  <text fg={isSelected ? theme.background : theme.textMuted}>
                                    {line}
                                  </text>
                                </box>
                              </box>
                              <Show when={props.onRemove}>
                                <text
                                  fg={theme.textMuted}
                                  onMouseUp={(e) => {
                                    e.stopPropagation()
                                    props.onRemove?.(artifact.id)
                                  }}
                                >
                                  ✕
                                </text>
                              </Show>
                            </box>
                          )
                        }}
                      </For>
                    </box>
                  )}
                </For>
              </box>
            </scrollbox>
          </Show>
        </box>
      </Show>
    </box>
  )
}
