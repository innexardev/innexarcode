/** @jsxImportSource @opentui/solid */
import { createSignal, For, Show } from "solid-js"
import { useTheme } from "../context/theme"
import { RGBA } from "@opentui/core"

interface ArtifactCardProps {
  title: string
  type: string
  language?: string
  size: number
  lines: number
  tokens: number
  preview: string
  content: string
  icon?: string
  maxPreviewLines?: number
  width: number
}

function typeIcon(type: string): string {
  switch (type) {
    case "code": return "📄"
    case "log": return "📋"
    case "json": return "📋"
    case "image": return "🖼"
    case "pdf": return "📕"
    case "archive": return "📦"
    case "sql": return "🗄"
    case "diff": return "📑"
    case "error": return "❌"
    default: return "📄"
  }
}

function languageBadge(lang: string): { label: string; color: RGBA; bg: RGBA } {
  switch (lang) {
    case "typescript":
    case "ts":
      return { label: "TS", color: RGBA.fromInts(100, 180, 255), bg: RGBA.fromInts(0, 80, 160) }
    case "javascript":
    case "js":
      return { label: "JS", color: RGBA.fromInts(255, 220, 80), bg: RGBA.fromInts(120, 100, 0) }
    case "python":
    case "py":
      return { label: "PY", color: RGBA.fromInts(120, 200, 120), bg: RGBA.fromInts(0, 100, 0) }
    case "rust":
    case "rs":
      return { label: "RS", color: RGBA.fromInts(255, 180, 80), bg: RGBA.fromInts(120, 70, 0) }
    case "go":
      return { label: "GO", color: RGBA.fromInts(100, 200, 220), bg: RGBA.fromInts(0, 80, 100) }
    case "sh":
    case "bash":
      return { label: "SH", color: RGBA.fromInts(180, 220, 220), bg: RGBA.fromInts(60, 100, 100) }
    case "sql":
      return { label: "SQL", color: RGBA.fromInts(255, 180, 255), bg: RGBA.fromInts(100, 0, 100) }
    case "json":
      return { label: "JSON", color: RGBA.fromInts(220, 200, 160), bg: RGBA.fromInts(100, 80, 40) }
    case "yaml":
    case "yml":
      return { label: "YML", color: RGBA.fromInts(200, 180, 140), bg: RGBA.fromInts(90, 70, 30) }
    default:
      return {
        label: lang.slice(0, 2).toUpperCase(),
        color: RGBA.fromInts(180, 180, 180),
        bg: RGBA.fromInts(80, 80, 80),
      }
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatLines(lines: number): string {
  return lines.toLocaleString()
}

function formatTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens} tokens`
  return `~${Math.round(tokens / 1000)}.${String(Math.round((tokens % 1000) / 100))}00 tokens`
}

export function ArtifactCard(props: ArtifactCardProps) {
  const { theme } = useTheme()
  const [expanded, setExpanded] = createSignal(false)
  const maxPreview = () => props.maxPreviewLines ?? 10
  const icon = () => props.icon ?? typeIcon(props.type)
  const previewLines = () => props.preview.split("\n").slice(0, maxPreview())
  const contentLines = () => props.content.split("\n")
  const hasMore = () => props.preview.split("\n").length > maxPreview()
  const langBadge = () => props.language ? languageBadge(props.language) : null

  return (
    <box flexDirection="column" width={props.width}>
      <box flexDirection="column" gap={0} border={true} borderColor={theme.border}>
        <box flexDirection="row" gap={1}>
          <text fg={theme.text}>{icon()}</text>
          <text fg={theme.text} wrapMode="none" maxWidth={props.width - 20}>
            {props.title}
          </text>
          <Show when={langBadge()}>
            {(badge) => (
              <text fg={badge().color} bg={badge().bg}>
                {" "}{badge().label}{" "}
              </text>
            )}
          </Show>
        </box>

        <box flexDirection="row" gap={1}>
          <text fg={theme.textMuted}>{formatBytes(props.size)}</text>
          <text fg={theme.textMuted}>·</text>
          <text fg={theme.textMuted}>{formatLines(props.lines)} linhas</text>
          <text fg={theme.textMuted}>·</text>
          <text fg={theme.textMuted}>{formatTokens(props.tokens)}</text>
        </box>

        <box flexDirection="column" gap={0}>
          <text fg={theme.textMuted}>Primeiras linhas:</text>
          <box flexDirection="column" gap={0}>
            <For each={previewLines()}>
              {(line) => (
                <text fg={theme.text} wrapMode="none" maxWidth={props.width - 4}>
                  {line}
                </text>
              )}
            </For>
          </box>
          <Show when={hasMore() && !expanded()}>
            <text fg={theme.textMuted}>...</text>
          </Show>
        </box>

        <box flexDirection="row" gap={0} onMouseUp={() => setExpanded((v) => !v)}>
          <text fg={theme.primary}>
            {expanded() ? "▲ Recolher" : "▼ Expandir"}
          </text>
        </box>

        <Show when={expanded()}>
          <box flexDirection="column" gap={0}>
            <For each={contentLines()}>
              {(line) => (
                <text fg={theme.text} wrapMode="none" maxWidth={props.width - 4}>
                  {line}
                </text>
              )}
            </For>
          </box>
        </Show>
      </box>
    </box>
  )
}
