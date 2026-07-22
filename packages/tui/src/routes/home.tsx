import { Prompt, type PromptRef } from "../component/prompt"
import { createEffect, createMemo, createSignal, For, Show, onMount } from "solid-js"
import { useSync } from "../context/sync"
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

let once = false
const placeholder = {
  normal: ["Create a project", "Review codebase", "Fix a bug", "Improve performance"],
  shell: ["ls -la", "git status", "pwd"],
}

export function Home() {
  const pluginRuntime = usePluginRuntime()
  const sync = useSync()
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

  // Build project list from sessions
  const projects = createMemo(() => {
    const sessions = sync.data.session
    const dirMap = new Map<string, { count: number; last: number; title: string }>()
    for (const s of sessions) {
      const dir = (s as any).directory || ""
      if (!dir || dir === "/root") continue
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

  // Sessions for selected project
  const projectSessions = createMemo(() => {
    const sel = selectedProject()
    if (!sel) return sync.data.session.filter((s) => s.parentID === undefined).sort((a, b) => b.time.updated - a.time.updated).slice(0, 10)
    return sync.data.session
      .filter((s) => (s as any).directory === sel || s.parentID === undefined)
      .sort((a, b) => b.time.updated - a.time.updated)
      .slice(0, 10)
  })

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
    return `${d.getDate()}/${d.getMonth() + 1}`
  }

  onMount(() => { editor.clearSelection() })

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
              <text fg={theme.primary}><b>Projects</b></text>
              <text fg={theme.textMuted}>{"\u2500".repeat(Math.max(10, leftW() - 4))}</text>
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
                        {proj.count} session{proj.count !== 1 ? "s" : ""}
                      </text>
                    </box>
                  )}
                </For>
              </scrollbox>
              <text fg={theme.textMuted}>{"\u2500".repeat(Math.max(10, leftW() - 4))}</text>
              <box onMouseUp={() => {
                try { Bun.write("/tmp/opencode-project", "/browse"); process.exit(0) } catch {}
              }}>
                <text fg={theme.secondary}>Browse filesystem {"\u2192"}</text>
              </box>
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
                  {(session) => (
                    <box
                      flexDirection="column" gap={0}
                      onMouseUp={() => mainRoute.navigate({ type: "session", sessionID: session.id })}
                      paddingTop={1} paddingBottom={1}
                    >
                      <text fg={theme.text} wrapMode="none" maxWidth={rightW() - 2}>
                        {"\u{1F4AC}"} {session.title}
                      </text>
                      <text fg={theme.textMuted} wrapMode="none" maxWidth={rightW() - 2}>
                        {(session as any).directory || ""} {"\u00B7"} {formatTime(session.time.updated)}
                      </text>
                    </box>
                  )}
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
