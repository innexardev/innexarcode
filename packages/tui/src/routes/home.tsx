import { Prompt, type PromptRef } from "../component/prompt"
import { createEffect, createMemo, createSignal, For, Show, onMount } from "solid-js"
import { useSync } from "../context/sync"
import { useSDK } from "../context/sdk"
import { Toast } from "../ui/toast"
import { useArgs } from "../context/args"
import { useRouteData, useRoute } from "../context/route"
import { usePromptRef } from "../context/prompt"
import { useLocal } from "../context/local"
import { usePluginRuntime } from "../plugin/runtime"
import { useEditorContext } from "../context/editor"
import { useTerminalDimensions } from "@opentui/solid"
import { useTuiConfig } from "../config"
import { HomeSessionDestinationProvider } from "./home/session-destination"
import { useTheme } from "../context/theme"
import { useProject } from "../context/project"
import path from "path"
import { Database } from "bun:sqlite"

let once = false
const placeholder = {
  normal: ["Create a project", "Review codebase", "Fix a bug", "Improve performance"],
  shell: ["ls -la", "git status", "pwd"],
}

export function Home() {
  const pluginRuntime = usePluginRuntime()
  const sync = useSync()
  const sdk = useSDK()
  const project = useProject()
  const route = useRouteData("home")
  const mainRoute = useRoute()
  const promptRef = usePromptRef()
  const [ref, setRef] = createSignal<PromptRef | undefined>()
  const args = useArgs()
  const local = useLocal()
  const editor = useEditorContext()
  const dimensions = useTerminalDimensions()
  const tuiConfig = useTuiConfig()
  const { theme } = useTheme()
  const promptMaxWidth = createMemo(() => {
    const configured = tuiConfig.prompt?.max_width
    if (configured === "auto") return Math.max(75, Math.floor(dimensions().width * 0.7))
    return configured ?? 75
  })
  let sent = false

  const [selectedProject, setSelectedProject] = createSignal<string | undefined>()
  const [mode, setMode] = createSignal<"projects" | "browse">("projects")
  const [browsePath, setBrowsePath] = createSignal("/root")
  const [browseEntries, setBrowseEntries] = createSignal<{ name: string; path: string; isDir: boolean }[]>([])
  const [browseLoading, setBrowseLoading] = createSignal(false)
  const [browseHistory, setBrowseHistory] = createSignal<string[]>(["/root"])
  const [allSessions, setAllSessions] = createSignal<any[]>([])

  // Load ALL sessions directly from SQLite (bypass project scope filter)
  onMount(async () => {
    editor.clearSelection()
    try {
      const dbPath = path.join(process.env.HOME || "/root", ".local/share/opencode/opencode.db")
      const db = new Database(dbPath, { readonly: true })
      const rows = db.prepare(
        "SELECT id, title, directory, time_updated, time_created, parent_id FROM session WHERE time_archived IS NULL ORDER BY time_updated DESC LIMIT 200"
      ).all() as any[]
      setAllSessions(rows.map(r => ({
        id: r.id,
        title: r.title,
        directory: r.directory,
        parentID: r.parent_id,
        time: { updated: r.time_updated, created: r.time_created },
      })))
      db.close()
      // Auto-select the current project directory if it exists in sessions
      const currentDir = project.data.instance.path.directory || process.cwd() || ""
      const matchingDir = rows.find(r => r.directory && (currentDir === r.directory || currentDir.startsWith(r.directory + "/") || r.directory.startsWith(currentDir + "/")))
      if (matchingDir?.directory) {
        setSelectedProject(matchingDir.directory)
      } else if (rows.length > 0 && rows[0].directory) {
        setSelectedProject(rows[0].directory)
      }
    } catch (e: any) {
      // Fallback to sync data
      setAllSessions(sync.data.session as any[])
    }
  })

  // Build project list from ALL sessions — show every directory
  const projects = createMemo(() => {
    const sessions = allSessions()
    const dirMap = new Map<string, { count: number; last: number; title: string }>()
    for (const s of sessions) {
      const dir = (s as any).directory || ""
      if (!dir) continue
      const existing = dirMap.get(dir)
      if (existing) {
        existing.count++
        if (s.time.updated > existing.last) { existing.last = s.time.updated; existing.title = s.title }
      } else {
        dirMap.set(dir, { count: 1, last: s.time.updated, title: s.title })
      }
    }
    return [...dirMap.entries()]
      .map(([path, info]) => ({ path, name: path.split("/").pop() || path, ...info }))
      .sort((a, b) => b.last - a.last)
      .slice(0, 15)
  })

  // Sessions for selected project (show root + children, sort by time)
  const projectSessions = createMemo(() => {
    const sel = selectedProject()
    const sessions = allSessions()
    if (!sel) {
      return sessions
        .filter((s) => !s.parentID)
        .sort((a, b) => b.time.updated - a.time.updated)
        .slice(0, 15)
    }
    const projectRoots = sessions.filter((s) => s.directory === sel && !s.parentID)
    const projectChildren = sessions.filter((s) => s.directory === sel && s.parentID)
    return sessions
      .filter((s) => s.directory === sel)
      .sort((a, b) => b.time.updated - a.time.updated)
      .slice(0, 20)
  })

  async function scanDir(dir: string) {
    setBrowseLoading(true)
    try {
      const resp = await sdk.client.file.list({ path: dir, throwOnError: false } as any)
      const items: { name: string; path: string; isDir: boolean }[] = []
      if (dir !== "/") {
        items.push({ name: "..", path: dir.substring(0, dir.lastIndexOf("/")) || "/", isDir: true })
      }
      if (resp?.data) {
        for (const e of resp.data) {
          if (e.name.startsWith(".")) continue
          items.push({ name: e.name, path: e.absolute || e.path, isDir: e.type === "directory" })
        }
      }
      items.sort((a, b) => {
        if (a.isDir && !b.isDir) return -1
        if (!a.isDir && b.isDir) return 1
        return a.name.localeCompare(b.name)
      })
      setBrowseEntries(items)
    } catch {}
    setBrowseLoading(false)
  }

  function navigateTo(path: string) {
    setBrowseHistory([...browseHistory(), path])
    setBrowsePath(path)
    scanDir(path)
  }

  function browseBack() {
    const h = browseHistory()
    if (h.length > 1) {
      const newH = h.slice(0, -1)
      setBrowseHistory(newH)
      const prev = newH[newH.length - 1] || "/"
      setBrowsePath(prev)
      scanDir(prev)
    }
  }

  function openProject(path: string) {
    try { Bun.write("/tmp/opencode-project", path); process.exit(0) } catch {}
  }

  const formatTime = (ts: number) => {
    if (!ts) return ""
    const d = new Date(ts)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 60000) return "now"
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    const hh = d.getHours().toString().padStart(2, "0")
    const mm = d.getMinutes().toString().padStart(2, "0")
    return `${d.getDate()}/${d.getMonth() + 1} ${hh}:${mm}`
  }

  const bind = (r: PromptRef | undefined) => {
    setRef(r); promptRef.set(r)
    if (once || !r) return
    if (route.prompt) { r.set(route.prompt); once = true; return }
    if (!args.prompt) return
    r.set({ input: args.prompt, parts: [] }); once = true
  }

  createEffect(() => {
    const r = ref()
    if (sent || !r) return
    if (!sync.ready || !local.model.ready) return
    if (!args.prompt) return
    if (r.current.input !== args.prompt) return
    sent = true; r.submit()
  })

  const leftW = () => Math.max(28, Math.floor(dimensions().width * 0.25))
  const rightW = () => Math.max(20, dimensions().width - leftW() - 5)

  return (
    <HomeSessionDestinationProvider>
      <box flexGrow={1} flexDirection="column">
        {/* Main content */}
        <box flexGrow={1} flexDirection="row" minHeight={0}>
          {/* Left: Projects */}
          <box width={leftW()} height="100%" paddingTop={1} paddingBottom={1} backgroundColor={theme.backgroundPanel}>
            <box flexDirection="column" gap={1} paddingLeft={1} paddingRight={1} height="100%">
              {/* Mode toggle */}
              <box flexDirection="row" gap={2}>
                <box onMouseUp={() => setMode("projects")}>
                  <text fg={mode() === "projects" ? theme.primary : theme.textMuted}>
                    {mode() === "projects" ? "\u25C9" : "\u25CB"} Projects
                  </text>
                </box>
                <box onMouseUp={() => { setMode("browse"); scanDir(browsePath()) }}>
                  <text fg={mode() === "browse" ? theme.primary : theme.textMuted}>
                    {mode() === "browse" ? "\u25C9" : "\u25CB"} Browse
                  </text>
                </box>
              </box>
              <text fg={theme.textMuted}>{"\u2500".repeat(Math.max(10, leftW() - 4))}</text>

              {/* Projects mode */}
              <Show when={mode() === "projects"}>
                <scrollbox flexGrow={1}>
                  <For each={projects()}>
                    {(proj) => (
                      <box
                        flexDirection="column" gap={0}
                        backgroundColor={selectedProject() === proj.path ? theme.primary : undefined}
                        onMouseUp={() => setSelectedProject(proj.path)}
                        paddingLeft={1} paddingRight={1}
                      >
                        <text fg={selectedProject() === proj.path ? theme.background : theme.text}>
                          {proj.count > 0 ? "\u{1F4E6}" : "\u{1F4C1}"} {proj.name}
                        </text>
                        <text fg={selectedProject() === proj.path ? theme.background : theme.textMuted} wrapMode="none" maxWidth={leftW() - 6}>
                          {proj.path}
                        </text>
                        <text fg={selectedProject() === proj.path ? theme.background : theme.textMuted}>
                          {proj.count} session{proj.count !== 1 ? "s" : ""} {"\u00B7"} {formatTime(proj.last)}
                        </text>
                      </box>
                    )}
                  </For>
                </scrollbox>
              </Show>

              {/* Browse mode */}
              <Show when={mode() === "browse"}>
                <box flexDirection="row" gap={1}>
                  <Show when={browseHistory().length > 1}>
                    <box onMouseUp={() => browseBack()}>
                      <text fg={theme.textMuted}>{"<"} </text>
                    </box>
                  </Show>
                  <text fg={theme.textMuted} wrapMode="none" maxWidth={leftW() - 6}>
                    {browsePath()}
                  </text>
                </box>
                <Show when={browseLoading()}>
                  <text fg={theme.textMuted}>Scanning...</text>
                </Show>
                <scrollbox flexGrow={1}>
                  <Show when={!browseLoading()}>
                    <For each={browseEntries()}>
                      {(entry) => (
                        <box
                          flexDirection="row" gap={1}
                          onMouseUp={() => {
                            if (entry.isDir) navigateTo(entry.path)
                            else openProject(entry.path)
                          }}
                          paddingLeft={1}
                        >
                          <text fg={entry.isDir ? theme.primary : theme.textMuted}>
                            {entry.isDir ? "\u{1F4C1}" : "\u{1F4C4}"}
                          </text>
                          <text fg={entry.isDir ? theme.primary : theme.text} wrapMode="none" maxWidth={leftW() - 6}>
                            {entry.name}
                          </text>
                        </box>
                      )}
                    </For>
                  </Show>
                </scrollbox>
                <text fg={theme.textMuted}>{"\u2500".repeat(Math.max(10, leftW() - 4))}</text>
                <box onMouseUp={() => openProject(browsePath())}>
                  <text fg={theme.secondary}>Open {"\u2192"}</text>
                </box>
              </Show>
            </box>
          </box>

          {/* Divider */}
          <box width={1} backgroundColor={theme.border} />

          {/* Right: Conversations */}
          <box flexGrow={1} height="100%" paddingTop={1} paddingBottom={1} paddingLeft={2} paddingRight={2}>
            <box flexDirection="column" gap={1} height="100%">
              <text fg={theme.text}>
                <b>{selectedProject() ? `Conversations — ${selectedProject()!.split("/").pop()}` : "Recent Conversations"}</b>
              </text>
              <text fg={theme.textMuted}>{"\u2500".repeat(Math.max(10, rightW() - 2))}</text>
              <scrollbox flexGrow={1}>
                <For each={projectSessions()}>
                  {(session) => {
                    return (
                      <box
                        flexDirection="column" gap={0}
                        onMouseUp={() => {
                          const sessionDir = (session as any).directory || ""
                          const currentDir = project.data.instance.path.directory || process.cwd() || ""
                          const isSameProject = currentDir === sessionDir || currentDir.startsWith(sessionDir + "/") || sessionDir.startsWith(currentDir + "/")
                          if (sessionDir && !isSameProject) {
                            try { Bun.write("/tmp/opencode-project", sessionDir); process.exit(0) } catch {}
                            return
                          }
                          mainRoute.navigate({ type: "session", sessionID: session.id })
                        }}
                        paddingTop={1} paddingBottom={1}
                      >
                        <text fg={theme.text} wrapMode="none" maxWidth={rightW() - 2}>
                          {"\u{1F4AC}"} {session.title}
                        </text>
                        <text fg={theme.textMuted} wrapMode="none" maxWidth={rightW() - 2}>
                          {formatTime(session.time.updated)} {"\u00B7"} {((session as any).directory || "").split("/").pop()}
                        </text>
                      </box>
                    )
                  }}
                </For>
                <Show when={projectSessions().length === 0}>
                  <text fg={theme.textMuted}>No conversations yet</text>
                </Show>
              </scrollbox>
            </box>
          </box>
        </box>

        {/* Prompt bar at bottom */}
        <box width="100%" flexShrink={0} paddingTop={1} paddingBottom={1} paddingLeft={2} paddingRight={2}>
          <box width="100%" maxWidth={promptMaxWidth()} zIndex={1000} flexShrink={0}>
            <pluginRuntime.Slot name="home_prompt" mode="replace" ref={bind}>
              <Prompt ref={bind} right={<pluginRuntime.Slot name="home_prompt_right" />} placeholders={placeholder} />
            </pluginRuntime.Slot>
          </box>
        </box>
      </box>
      <Toast />
    </HomeSessionDestinationProvider>
  )
}
