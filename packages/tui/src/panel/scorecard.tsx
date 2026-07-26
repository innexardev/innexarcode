/** @jsxImportSource @opentui/solid */
import { For } from "solid-js"
import { useTheme } from "../context/theme"
import { RGBA } from "@opentui/core"

export interface ScorecardCheck {
  name: string
  passed: boolean
  weight: number
}

export interface ScorecardProps {
  dimension: string
  score: number
  grade: string
  checks: ScorecardCheck[]
  width: number
}

function gradeColor(grade: string): RGBA {
  switch (grade) {
    case "A": return RGBA.fromInts(0, 200, 0)
    case "B": return RGBA.fromInts(0, 100, 255)
    case "C": return RGBA.fromInts(200, 200, 0)
    case "D": return RGBA.fromInts(255, 165, 0)
    case "F": return RGBA.fromInts(255, 50, 50)
    default: return RGBA.fromInts(200, 200, 200)
  }
}

export function Scorecard(props: ScorecardProps) {
  const { theme } = useTheme()
  const barWidth = props.width - 20

  const filled = Math.max(1, Math.floor((props.score / 100) * barWidth))
  const empty = Math.max(0, barWidth - filled)
  const gColor = gradeColor(props.grade)

  return (
    <box flexDirection="column" gap={1}>
      <box flexDirection="row" gap={1}>
        <text fg={theme.text} wrapMode="none" maxWidth={14}>
          {props.dimension}
        </text>
        <text>
          <text fg={gColor}>{"█".repeat(filled)}</text>
          <text fg={theme.textMuted}>{"░".repeat(empty)}</text>
          <text fg={theme.text}>{` ${props.score}%`}</text>
        </text>
        <text fg={gColor}>{` ${props.grade}`}</text>
      </box>
      <For each={props.checks}>
        {(check) => (
          <box flexDirection="row" gap={1}>
            <text fg={check.passed ? theme.success : theme.error}>
              {check.passed ? "✓" : "✗"}
            </text>
            <text fg={theme.text} wrapMode="none" maxWidth={props.width - 12}>
              {check.name}
            </text>
            <text fg={theme.textMuted}>({check.weight})</text>
          </box>
        )}
      </For>
    </box>
  )
}
