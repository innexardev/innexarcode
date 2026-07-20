/** @jsxImportSource @opentui/solid */
import { createMemo, createSignal, For, Show, onMount } from "solid-js"
import { useTheme } from "../context/theme"
import { useRoute } from "../context/route"
import { useSDK } from "../context/sdk"
import { useSync } from "../context/sync"
import { useProject } from "../context/project"

const HOME_DIR = "/root"

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

  const startDir = createMemo(() => {
    const dir = project.instance.directory()
    return dir || "/root"
  })

  const [currentPath, setCurrentPath] = createSignal("/root")
  const [entries, setEntries] = createSignal<DirEntry[]>([])
  const [history, setHistory] = createSignal<string[]>(["/root"])
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | undefined>()

  async function scanDir(dir: string) {
    setLoading(true)
    setError(undefined)
    try {
      const items: DirEntry[] = []

      // Parent directory entry
      if (dir !== "/") {
        const parent = dir.substring(0, dir.lastIndexOf("/")) || "/"
        items.push({ name: ".. (up)", path: parent, isDir: true })
      }

      // Use SDK file.list to get directory contents
      const response = await sdk.client.file.list({
        path: dir,
        throwOnError: false,
      } as any)

      if (response?.data) {
        for (const entry of response.data) {
          items.push({
            name: entry.name,
            path: entry.absolute || entry.path,
            isDir: entry.type === "directory",
            isProject: entry.type === "directory" && entry.name !== ".." && (
              entry.name === "node_modules" ? false :
              entry.name.startsWith(".") ? false : true
            ),
          })
        }
      }

      // Sort: directories first, then files, alphabetically
      items.sort((a, b) => {
        if (a.isDir && !b.isDir) return -1
        if (!a.isDir && b.isDir) return 1
        return a.name.localeCompare(b.name)
      })

      // Detect project directories (has package.json)
      for (const item of items) {
        if (item.isDir && item.name !== ".. (up)" && !item.name.startsWith(".") && item.name !== "node_modules") {
          try {
            const pkgResponse = await sdk.client.file.read({
              path: item.path + "/package.json",
              throwOnError: false,
            } as any)
            item.isProject = pkgResponse?.data?.type === "text"
          } catch {
            item.isProject = false
          }
        }
      }

      setEntries(items)
    } catch (err) {
      setError(String(err))
      setEntries([])
    }
    setLoading(false)
  }

  async function navigateTo(path: string) {
    setHistory([...history(), path])
    setCurrentPath(path)
    await scanDir(path)
  }

  function goBack() {
    if (history().length > 1) {
      const newHistory = history().slice(0, -1)
      setHistory(newHistory)
      setCurrentPath(newHistory[newHistory.length - 1])
      scanDir(newHistory[newHistory.length - 1])
    }
  }

  function openProject(path: string) {
    route.navigate({
      type: "session",
      sessionID: "",
      prompt: { input: `Open project at ${path}`, parts: [] },
    })
  }

  onMount(() => {
    const dir = startDir()
    setCurrentPath(dir)
    setHistory([dir])
    scanDir(dir)
  })

  // Keyboard: backspace goes up
  function handleKey(e: KeyboardEvent) {
    if (e.key === "Backspace" || e.key === "Escape") {
      goBack()
    }
  }

  return (
    <box flexDirection="column" gap={1} paddingLeft={1} paddingRight={1}>
      <text fg={theme.text}>
        <b>Projects</b>
      </text>

      {/* Current path with back button */}
      <box flexDirection="row" gap={1}>
        <Show when={history().length > 1}>
          <text fg={theme.textMuted} onMouseUp={goBack}>{"<"}</text>
        </Show>
        <text fg={theme.textMuted} wrapMode="none" maxWidth={props.width - 4}>
          {currentPath()}
        </text>
      </box>

      {/* Recent sessions */}
      <Show when={sync.data.session.length > 0}>
        <text fg={theme.textMuted}>Recent</text>
        <For each={sync.data.session.filter((s) => s.parentID === undefined).slice(0, 3)}>
          {(session) => (
            <box
              flexDirection="row" gap={1}
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

      {/* Browse */}
      <text fg={theme.textMuted}>Browse</text>

      {/* Loading indicator */}
      <Show when={loading()}>
        <text fg={theme.textMuted}>Scanning...</text>
      </Show>

      {/* Error state */}
      <Show when={error()}>
        <text fg={theme.error}>{error()}</text>
      </Show>

      {/* Directory entries */}
      <Show when={!loading() && entries().length > 0}>
        <scrollbox flexGrow={1} paddingRight={1}>
          <For each={entries()}>
            {(entry) => (
              <box
                flexDirection="row" gap={1}
                onMouseUp={() => {
                  if (entry.isDir) navigateTo(entry.path)
                  else openProject(entry.path)
                }}
              >
                <text fg={entry.isProject ? theme.success : entry.isDir ? theme.primary : theme.textMuted}>
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
        </scrollbox>
      </Show>

      {/* Empty state */}
      <Show when={!loading() && entries().length === 0 && !error()}>
        <text fg={theme.textMuted}>No files found</text>
        <box flexDirection="row" gap={1} onMouseUp={() => navigateTo("/")}>
          <text fg={theme.primary}>📁</text>
          <text fg={theme.text}>/ (root)</text>
        </box>
        <box flexDirection="row" gap={1} onMouseUp={() => navigateTo("/root")}>
          <text fg={theme.primary}>📁</text>
          <text fg={theme.text}>/root</text>
        </box>
        <box flexDirection="row" gap={1} onMouseUp={() => navigateTo("/home")}>
          <text fg={theme.primary}>📁</text>
          <text fg={theme.text}>/home</text>
        </box>
      </Show>
    </box>
  )
}
