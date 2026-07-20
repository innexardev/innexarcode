/** @jsxImportSource @opentui/solid */
import { createSignal, For, Show } from "solid-js"
import { useTheme } from "../context/theme"
import type { RGBA } from "@opentui/core"

export interface TreeNode {
  name: string
  path: string
  type: "file" | "directory"
  children?: TreeNode[]
  dependencyCount?: number
}

interface GraphViewProps {
  tree: TreeNode[]
  width: number
  onSelect?: (path: string) => void
}

function fileColor(name: string, theme: ReturnType<typeof useTheme>["theme"]): RGBA {
  if (name.endsWith(".ts") || name.endsWith(".tsx")) return theme.secondary
  if (name.endsWith(".json")) return theme.textMuted
  if (name.endsWith(".sql") || name.endsWith(".prisma")) return theme.info
  if (name.endsWith(".md")) return theme.success
  if (name.endsWith(".css") || name.endsWith(".scss")) return theme.warning
  return theme.text
}

function NodeRow(props: {
  node: TreeNode
  depth: number
  isLast: boolean
  prefix: string
  expanded: Set<string>
  onToggle: (path: string) => void
  onSelect?: (path: string) => void
  width: number
}) {
  const { theme } = useTheme()
  const open = () => props.expanded.has(props.node.path)

  const connector = props.depth === 0 ? "" : props.isLast ? "└── " : "├── "
  const childPrefix = props.depth === 0 ? "" : props.prefix + (props.isLast ? "    " : "│   ")

  const color = () => props.node.type === "directory" ? theme.primary : fileColor(props.node.name, theme)
  const label = props.node.name + (props.node.dependencyCount != null ? ` (${props.node.dependencyCount})` : "")

  return (
    <box flexDirection="column" gap={0}>
      <box
        flexDirection="row"
        gap={0}
        onMouseUp={() => {
          if (props.node.type === "directory") props.onToggle(props.node.path)
          props.onSelect?.(props.node.path)
        }}
      >
        <Show when={props.depth > 0}>
          <text fg={theme.textMuted}>{props.prefix}{connector}</text>
        </Show>
        <Show when={props.node.type === "directory"}>
          <text fg={theme.primary}>{open() ? "▼ " : "▶ "}</text>
        </Show>
        <text fg={color()} wrapMode="none" maxWidth={props.width - props.depth * 4 - 2}>
          {label}
        </text>
      </box>
      <Show when={props.node.type === "directory" && open() && props.node.children}>
        <For each={props.node.children!}>
          {(child, i) => (
            <NodeRow
              node={child}
              depth={props.depth + 1}
              isLast={i() === props.node.children!.length - 1}
              prefix={childPrefix}
              expanded={props.expanded}
              onToggle={props.onToggle}
              onSelect={props.onSelect}
              width={props.width}
            />
          )}
        </For>
      </Show>
    </box>
  )
}

export function GraphView(props: GraphViewProps) {
  const [expanded, setExpanded] = createSignal<Set<string>>(new Set())

  function toggle(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <box flexDirection="column" gap={0}>
      <For each={props.tree}>
        {(node, i) => (
          <NodeRow
            node={node}
            depth={0}
            isLast={i() === props.tree.length - 1}
            prefix=""
            expanded={expanded()}
            onToggle={toggle}
            onSelect={props.onSelect}
            width={props.width}
          />
        )}
      </For>
    </box>
  )
}

export function buildFileTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = []

  for (const fullPath of paths) {
    const parts = fullPath.split("/").filter(Boolean)
    let current = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!
      const isDir = i < parts.length - 1
      const existing = current.find((n) => n.name === part)

      if (existing) {
        if (isDir) current = existing.children!
      } else {
        const node: TreeNode = {
          name: part,
          path: parts.slice(0, i + 1).join("/"),
          type: isDir ? "directory" : "file",
          children: isDir ? [] : undefined,
        }
        current.push(node)
        if (isDir) current = node.children!
      }
    }
  }

  return root
}
