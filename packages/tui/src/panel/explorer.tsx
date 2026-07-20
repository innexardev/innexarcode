/** @jsxImportSource @opentui/solid */
import { createMemo, createSignal, For, Show } from "solid-js"
import { useTheme } from "../context/theme"

export interface FileTreeItem {
  name: string
  path: string
  type: "file" | "directory"
  children?: FileTreeItem[]
}

export interface FileExplorerProps {
  files: FileTreeItem[]
  width: number
  maxInitialDepth?: number
  onFileSelect?: (path: string) => void
}

export function buildFileTree(paths: string[]): FileTreeItem[] {
  const dirPrefixes = new Set<string>()
  for (const filePath of paths) {
    const parts = filePath.split("/").filter(Boolean)
    for (let i = 0; i < parts.length - 1; i++) {
      dirPrefixes.add(parts.slice(0, i + 1).join("/"))
    }
  }

  const root: FileTreeItem[] = []
  for (const filePath of paths) {
    const parts = filePath.split("/").filter(Boolean)
    let current = root
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const fullPath = parts.slice(0, i + 1).join("/")
      const isDir = i < parts.length - 1 || dirPrefixes.has(fullPath)

      let existing = current.find((item) => item.name === part)
      if (!existing) {
        existing = {
          name: part,
          path: fullPath,
          type: isDir ? "directory" : "file",
          children: isDir ? [] : undefined,
        }
        current.push(existing)
      } else if (isDir && existing.type === "file") {
        existing.type = "directory"
        existing.children = []
      }

      if (existing.type === "directory" && existing.children) {
        current = existing.children
      }
    }
  }

  sortItems(root)
  return root
}

function sortItems(items: FileTreeItem[]) {
  items.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  for (const item of items) {
    if (item.children) sortItems(item.children)
  }
}

interface FlatItem {
  item: FileTreeItem
  depth: number
  isLastChain: boolean[]
  expanded: boolean | undefined
}

function flattenTree(
  items: FileTreeItem[],
  expandedSet: Set<string>,
  depth = 0,
  parentIsLast: boolean[] = [],
): FlatItem[] {
  const result: FlatItem[] = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const isLastInSiblings = i === items.length - 1
    const isLastChain = [...parentIsLast, isLastInSiblings]
    const expanded = item.type === "directory" ? expandedSet.has(item.path) : undefined
    result.push({ item, depth, isLastChain, expanded })
    if (item.type === "directory" && expandedSet.has(item.path) && item.children) {
      result.push(...flattenTree(item.children, expandedSet, depth + 1, isLastChain))
    }
  }
  return result
}

function treePrefix(isLastChain: boolean[], depth: number): string {
  let s = ""
  for (let i = 0; i < depth; i++) {
    s += isLastChain[i] ? "    " : "│   "
  }
  s += isLastChain[depth] ? "└── " : "├── "
  return s
}

export function FileExplorer(props: FileExplorerProps) {
  const { theme } = useTheme()

  const initialExpanded = new Set<string>()
  function collect(items: FileTreeItem[], depth: number) {
    for (const item of items) {
      if (item.type === "directory" && depth < (props.maxInitialDepth ?? 2)) {
        initialExpanded.add(item.path)
        if (item.children) collect(item.children, depth + 1)
      }
    }
  }
  collect(props.files, 0)

  const [expanded, setExpanded] = createSignal(initialExpanded)

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const flatItems = createMemo(() => flattenTree(props.files, expanded()))

  return (
    <Show when={props.files.length > 0}>
      <box gap={0}>
        <For each={flatItems()}>
          {(flat) => {
            const isDir = flat.item.type === "directory"
            const prefix = treePrefix(flat.isLastChain, flat.depth)
            const prefixWidth = (flat.depth + 1) * 4
            const indicator = isDir ? (flat.expanded ? "▾" : "▸") : " "
            const displayName = `${indicator} ${flat.item.name}${isDir ? "/" : ""}`
            const nameWidth = Math.max(1, props.width - prefixWidth)

            return (
              <box
                flexDirection="row"
                onMouseDown={() => {
                  if (isDir) toggle(flat.item.path)
                  else props.onFileSelect?.(flat.item.path)
                }}
              >
                <text fg={theme.textMuted} wrapMode="none">
                  {prefix}
                </text>
                <text
                  fg={isDir ? theme.primary : theme.text}
                  wrapMode="none"
                  maxWidth={nameWidth}
                >
                  {displayName}
                </text>
              </box>
            )
          }}
        </For>
      </box>
    </Show>
  )
}
