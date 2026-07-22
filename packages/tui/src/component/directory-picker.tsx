/** @jsxImportSource @opentui/solid */
import { createMemo, createSignal, For, Show, onMount } from "solid-js"
import { useTheme } from "../context/theme"
import { useRoute } from "../context/route"
import { useSDK } from "../context/sdk"
import { useSync } from "../context/sync"
import { useProject } from "../context/project"

interface ProjectEntry {
  name: string
  path: string
  sessions: number
  lastUsed: number
  type: string
  icon: string
  branch: string
}

export function DirectoryPicker(props: { width: number }) {
  const { theme } = useTheme()
  const route = useRoute()
  const sdk = useSDK()
  const sync = useSync()
  const project = useProject()

  const [currentPath, setCurrentPath] = createSignal("")
  const [entries, setEntries] = createSignal<{ name: string; path: string; isDir: boolean }[]>([])
  const [loading, setLoading] = createSignal(false)
  const [mode, setMode] = createSignal<"projects" | "browse">("projects")
  const [history, setHistory] = createSignal<string[]>([])

  // Build project list from sessions
  const projects = createMemo<ProjectEntry[]>(() => {
    const sessions = sync.data.session
    const dirMap = new Map<string, { count: number; last: number; title: string }>()

    for (const s of sessions) {
      // Try to get directory from session - it might be in different fields
      const dir = (s as any).directory || (s as any).projectID || ""
      if (!dir || dir === "/root") continue
      const existing = dirMap.get(dir)
      if (existing) {
        existing.count++
        if (s.time.updated > existing.last) {
          existing.last = s.time.updated
          existing.title = s.title
        }
      } else {
        dirMap.set(dir, { count: 1, last: s.time.updated, title: s.title })
      }
    }

    // Convert to array and sort by last used
    const result: ProjectEntry[] = []
    for (const [path, info] of dirMap) {
      const name = path.split("/").pop() || path
      const isNode = info.title.includes(".ts") || info.title.includes("npm") || info.title.includes("node")
      const isReact = info.title.includes("react") || info.title.includes("frontend")
      const isPython = info.title.includes("python") || info.title.includes("flask") || info.title.includes("django")

      result.push({
        name,
        path,
        sessions: info.count,
        lastUsed: info.last,
        type: isReact ? "React" : isNode ? "Node.js" : isPython ? "Python" : "Project",
        icon: isReact ? "\u269B" : isNode ? "\u2B21" : isPython ? "\u{1F40D}" : "\u{1F4C1}",
        branch: "",
      })
    }

    result.sort((a, b) => b.lastUsed - a.lastUsed)
    return result.slice(0, 15)
  })

  function openProject(path: string) {
    // Write selected path and restart
    try {
      // Save selected path and exit — wrapper will restart in this directory
      const { writeFileSync } = require("fs")
      writeFileSync("/tmp/opencode-project", path, "utf8")
    } catch {}
    // Exit the TUI — wrapper will pick up the path
    if (typeof window !== "undefined") {
      (window as any).close?.()
    } else {
      process.exit(0)
    }
  }

  async function scanDir(dir: string) {
    setLoading(true)
    try {
      const resp = await sdk.client.file.list({ path: dir, throwOnError: false } as any)
      const items: { name: string; path: string; isDir: boolean }[] = []

      if (dir !== "/") {
        items.push({ name: "..", path: dir.substring(0, dir.lastIndexOf("/")) || "/", isDir: true })
      }

      if (resp?.data) {
        for (const e of resp.data) {
          items.push({ name: e.name, path: e.absolute || e.path, isDir: e.type === "directory" })
        }
      }

      items.sort((a, b) => {
        if (a.isDir && !b.isDir) return -1
        if (!a.isDir && b.isDir) return 1
        return a.name.localeCompare(b.name)
      })

      setEntries(items)
    } catch {}
    setLoading(false)
  }

  function navigateTo(path: string) {
    setHistory([...history(), path])
    setCurrentPath(path)
    scanDir(path)
  }

  onMount(() => {
    // Start in projects mode
    setMode("projects")
  })

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`
  }

  return (
    <box flexDirection="column" gap={1} paddingLeft={2} paddingRight={2} height="100%">
      {/* Header */}
      <text fg={theme.primary}><b>Engineering OS</b></text>
      <text fg={theme.textMuted}>Project Launcher</text>
      <text fg={theme.textMuted}>{"\u2500".repeat(Math.max(10, props.width - 4))}</text>

      {/* Mode toggle */}
      <box flexDirection="row" gap={2}>
        <box onMouseUp={() => setMode("projects")}>
          <text fg={mode() === "projects" ? theme.primary : theme.textMuted}>
            {mode() === "projects" ? "\u25C9" : "\u25CB"} Projects
          </text>
        </box>
        <box onMouseUp={() => setMode("browse")}>
          <text fg={mode() === "browse" ? theme.primary : theme.textMuted}>
            {mode() === "browse" ? "\u25C9" : "\u25CB"} Browse
          </text>
        </box>
      </box>

      {/* Projects mode */}
      <Show when={mode() === "projects"}>
        <Show when={projects().length === 0}>
          <text fg={theme.textMuted}>No recent projects</text>
          <box onMouseUp={() => setMode("browse")}>
            <text fg={theme.secondary}>Browse filesystem →</text>
          </box>
        </Show>
        <scrollbox flexGrow={1}>
          <For each={projects()}>
            {(proj) => (
              <box
                flexDirection="row" gap={1}
                onMouseUp={() => openProject(proj.path)}
              >
                <text fg={theme.primary}>{proj.icon}</text>
                <box flexDirection="column" gap={0}>
                  <text fg={theme.text} wrapMode="none" maxWidth={props.width - 8}>
                    {proj.name}
                  </text>
                  <text fg={theme.textMuted} wrapMode="none" maxWidth={props.width - 8}>
                    {proj.path} {proj.branch ? `(${proj.branch})` : ""}
                  </text>
                  <text fg={theme.textMuted}>
                    {proj.sessions} session{proj.sessions > 1 ? "s" : ""} · {formatTime(proj.lastUsed)}
                  </text>
                </box>
              </box>
            )}
          </For>
        </scrollbox>
      </Show>

      {/* Browse mode */}
      <Show when={mode() === "browse"}>
        <box flexDirection="row" gap={1}>
          <Show when={history().length > 0}>
            <box onMouseUp={() => {
              const h = history()
              if (h.length > 1) {
                const newH = h.slice(0, -1)
                setHistory(newH)
                setCurrentPath(newH[newH.length - 1] || "/")
                scanDir(newH[newH.length - 1] || "/")
              }
            }}>
              <text fg={theme.textMuted}>{"<"} </text>
            </box>
          </Show>
          <text fg={theme.textMuted} wrapMode="none" maxWidth={props.width - 6}>
            {currentPath() || "/"}
          </text>
        </box>

        <Show when={loading()}>
          <text fg={theme.textMuted}>Scanning...</text>
        </Show>

        <scrollbox flexGrow={1}>
          <Show when={!loading()}>
            <For each={entries()}>
              {(entry) => (
                <box
                  flexDirection="row" gap={1}
                  onMouseUp={() => {
                    if (entry.isDir) navigateTo(entry.path)
                    else openProject(entry.path)
                  }}
                >
                  <text fg={entry.isDir ? theme.primary : theme.textMuted}>
                    {entry.isDir ? "\u{1F4C1}" : "\u{1F4C4}"}
                  </text>
                  <text fg={entry.isDir ? theme.primary : theme.text} wrapMode="none" maxWidth={props.width - 6}>
                    {entry.name}
                  </text>
                </box>
              )}
            </For>
          </Show>
        </scrollbox>
      </Show>
    </box>
  )
}
