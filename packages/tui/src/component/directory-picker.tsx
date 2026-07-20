/** @jsxImportSource @opentui/solid */
import { createMemo, createSignal, For, Show, onMount } from "solid-js"
import { useTheme } from "../context/theme"
import { useRoute } from "../context/route"
import { useSDK } from "../context/sdk"
import { useSync } from "../context/sync"
import { useProject } from "../context/project"

const HOME_DIR = "/root"
const SCAN_DIRS = ["/root", "/home"]

interface DirEntry {
  name: string
  path: string
  isDir: boolean
  isProject?: boolean
}

export function DirectoryPicker(props: { width: number }) {
  const { theme } = useTheme()
  const route = useRoute()
  const sdk = useSDK()
  const sync = useSync()
  const project = useProject()

  const [currentPath, setCurrentPath] = createSignal(HOME_DIR)
  const [entries, setEntries] = createSignal<DirEntry[]>([])
  const [history, setHistory] = createSignal<string[]>([HOME_DIR])
  const [loading, setLoading] = createSignal(false)

  // Scan current directory
  async function scanDir(dir: string) {
    setLoading(true)
    try {
      // Use a simple approach to list directories
      const items: DirEntry[] = []
      
      // Add parent directory
      if (dir !== "/") {
        const parent = dir.substring(0, dir.lastIndexOf("/")) || "/"
        items.push({ name: "..", path: parent, isDir: true })
      }

      // Try to read directory entries using the SDK or project context
      // For now, we'll use a simple scan via the existing tools
      const result = entries() // keep existing while loading
      
      setEntries(items)
    } catch {}
    setLoading(false)
  }

  // Navigate into a directory
  async function navigateTo(path: string) {
    setHistory([...history(), path])
    setCurrentPath(path)
    await scanDir(path)
  }

  // Go back
  function goBack() {
    if (history().length > 1) {
      const newHistory = history().slice(0, -1)
      setHistory(newHistory)
      setCurrentPath(newHistory[newHistory.length - 1])
      scanDir(newHistory[newHistory.length - 1])
    }
  }

  // Open project in this directory
  function openProject(path: string) {
    // Navigate to a session with this project path
    // This redirects opencode to open in that directory
    route.navigate({
      type: "session",
      sessionID: "",  // Will create new session
      prompt: { input: `Open project at ${path}`, parts: [] },
    })
  }

  onMount(() => {
    scanDir(HOME_DIR)
  })

  return (
    <box flexDirection="column" gap={1} paddingLeft={1} paddingRight={1}>
      {/* Header */}
      <text fg={theme.text}>
        <b>Projects</b>
      </text>

      {/* Current path */}
      <text fg={theme.textMuted} wrapMode="none" maxWidth={props.width - 2}>
        {currentPath()}
      </text>

      {/* Recent projects from sessions */}
      <Show when={sync.data.session.length > 0}>
        <text fg={theme.textMuted}>── Recent ──</text>
        <For each={sync.data.session.filter((s) => s.parentID === undefined).slice(0, 5)}>
          {(session) => (
            <box
              flexDirection="row"
              gap={1}
              onMouseUp={() => route.navigate({ type: "session", sessionID: session.id })}
            >
              <text fg={theme.secondary}>📁</text>
              <text fg={theme.text} wrapMode="none" maxWidth={props.width - 6}>
                {session.title}
              </text>
            </box>
          )}
        </For>
      </Show>

      {/* Browse section */}
      <text fg={theme.textMuted}>── Browse ──</text>

      <Show when={loading()}>
        <text fg={theme.textMuted}>Scanning...</text>
      </Show>

      <Show when={!loading() && entries().length === 0}>
        <box
          flexDirection="row"
          gap={1}
          onMouseUp={() => navigateTo("/root")}
        >
          <text fg={theme.primary}>📁</text>
          <text fg={theme.text}>/root</text>
        </box>
        <box
          flexDirection="row"
          gap={1}
          onMouseUp={() => navigateTo("/home")}
        >
          <text fg={theme.primary}>📁</text>
          <text fg={theme.text}>/home</text>
        </box>
        <box
          flexDirection="row"
          gap={1}
          onMouseUp={() => navigateTo("/")}
        >
          <text fg={theme.primary}>📁</text>
          <text fg={theme.text}>/ (root)</text>
        </box>
      </Show>

      {/* Directory entries */}
      <Show when={entries().length > 0}>
        <For each={entries()}>
          {(entry) => (
            <box
              flexDirection="row"
              gap={1}
              onMouseUp={() => {
                if (entry.isDir) {
                  navigateTo(entry.path)
                } else {
                  openProject(entry.path)
                }
              }}
            >
              <text fg={entry.isProject ? theme.success : theme.primary}>
                {entry.isProject ? "📦" : entry.isDir ? "📁" : "📄"}
              </text>
              <text
                fg={entry.isProject ? theme.success : theme.text}
                wrapMode="none"
                maxWidth={props.width - 6}
              >
                {entry.name}
              </text>
            </box>
          )}
        </For>
      </Show>
    </box>
  )
}
