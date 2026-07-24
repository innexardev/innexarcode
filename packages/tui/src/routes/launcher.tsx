/** @jsxImportSource @opentui/solid */
import { createMemo, createResource, createSignal, For, Show } from "solid-js"
import { useTheme } from "../context/theme"
import { useSync } from "../context/sync"
import { useSDK } from "../context/sdk"
import { useRoute } from "../context/route"
import { useTerminalDimensions } from "@opentui/solid"
import { useProject } from "../context/project"
import { useToast } from "../ui/toast"
import { useExit } from "../context/exit"
import { useBindings } from "../keymap"
import { writeFileSync } from "node:fs"

type SessionInfo = {
  id: string
  title: string
  directory: string
  time: { updated: number }
  project?: { id: string; name?: string; worktree: string } | null
}

export function LauncherView() {
  const { theme } = useTheme()
  const sync = useSync()
  const sdk = useSDK()
  const route = useRoute()
  const project = useProject()
  const exit = useExit()
  const dims = useTerminalDimensions()
  const toast = useToast()
  const [selectedIdx, setSelectedIdx] = createSignal(0)
  const [expandedDir, setExpandedDir] = createSignal<string | null>(null)
  const [sessionIdx, setSessionIdx] = createSignal(-1)

  // Load all sessions across all projects
  // NOTE: pass directory="" to prevent SDK from auto-injecting current dir
  const [sessions] = createResource(
    () => sdk.client.experimental.session.list({
      directory: "",
      start: Date.now() - 90 * 24 * 60 * 60 * 1000,
      limit: 200,
    }).then(r => r.data ?? []),
  )

  // Group by directory, sorted by most recent session
  const projects = createMemo(() => {
    const list = sessions()
    if (!list?.length) return []
    const groups = new Map<string, { directory: string; sessions: SessionInfo[]; lastTime: number }>()
    for (const s of list) {
      const d = s.directory
      const g = groups.get(d) ?? { directory: d, sessions: [], lastTime: 0 }
      g.sessions.push(s)
      if (s.time.updated > g.lastTime) g.lastTime = s.time.updated
      groups.set(d, g)
    }
    return [...groups.values()]
      .sort((a, b) => b.lastTime - a.lastTime)
      .map((g) => ({
        ...g,
        sessions: g.sessions.toSorted((a, b) => b.time.updated - a.time.updated),
      }))
  })

  const currentDir = createMemo(() => sync.path.directory)

  // Bind keyboard navigation
  useBindings(() => ({
    up: () => {
      if (sessionIdx() >= 0) {
        setSessionIdx((i) => i - 1)
      } else {
        setSelectedIdx((i) => Math.max(0, i - 1))
      }
    },
    down: () => {
      if (expandedDir() && sessionIdx() >= 0) {
        const proj = projects()[selectedIdx()]
        if (proj && sessionIdx() < proj.sessions.length - 1) {
          setSessionIdx((i) => i + 1)
        } else {
          setSessionIdx(-1)
          setSelectedIdx((i) => Math.min(projects().length - 1, i + 1))
        }
      } else {
        setSelectedIdx((i) => Math.min(projects().length - 1, i + 1))
      }
    },
    enter: () => {
      if (expandedDir() && sessionIdx() >= 0) {
        const proj = projects()[selectedIdx()]
        const session = proj?.sessions[sessionIdx()]
        if (session) openSession(session)
        return
      }
      const proj = projects()[selectedIdx()]
      if (!proj) return
      if (proj.directory === currentDir()) {
        if (proj.sessions.length > 0) {
          if (expandedDir() === proj.directory) {
            setExpandedDir(null)
            setSessionIdx(-1)
          } else {
            setExpandedDir(proj.directory)
            setSessionIdx(0)
          }
        } else {
          route.navigate({ type: "home" })
        }
      } else {
        openDirectory(proj.directory)
      }
    },
    left: () => {
      if (sessionIdx() >= 0) {
        setSessionIdx(-1)
      }
    },
    right: () => {
      const proj = projects()[selectedIdx()]
      if (proj && expandedDir() !== proj.directory) {
        setExpandedDir(proj.directory)
        setSessionIdx(0)
      }
    },
    escape: () => {
      // Go to home screen
      route.navigate({ type: "home" })
    },
    n: () => {
      // Go to home screen - user can type /sessions or their prompt
      route.navigate({ type: "home" })
    },
  }))

  function openSession(session: SessionInfo) {
    if (session.directory === currentDir()) {
      route.navigate({ type: "session", sessionID: session.id })
    } else {
      writeFileSync("/tmp/opencode-project", session.directory, "utf-8")
      exit()
    }
  }

  function openDirectory(dir: string) {
    writeFileSync("/tmp/opencode-project", dir, "utf-8")
    exit()
  }

  const timeAgo = (ts: number) => {
    const diff = Date.now() - ts
    if (diff < 60000) return "agora"
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
    const d = new Date(ts)
    const today = new Date()
    if (d.toDateString() === today.toDateString()) return `Hoje`
    if (d.getFullYear() === today.getFullYear()) {
      return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`
    }
    return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`
  }

  const shortDir = (dir: string) => {
    const home = process.env.HOME || ""
    return dir.startsWith(home) ? "~" + dir.slice(home.length) : dir
  }

  return (
    <box flexGrow={1} flexDirection="column" padding={1}>
      <box height={1} />
      <text bold fontSize={24} fg={theme.accent}>
        OpenCode
      </text>
      <text fg={theme.textMuted} fontSize={14}>
        Selecione um projeto para continuar
      </text>
      <box height={1} />
      <box flexGrow={1} flexDirection="column" gap={1}>
        <For each={projects()}>
          {(proj, i) => (
            <box flexDirection="column" gap={0}>
              <box
                flexDirection="row"
                gap={2}
                paddingLeft={1}
                paddingRight={1}
                backgroundColor={i() === selectedIdx() && sessionIdx() < 0 ? theme.accent : undefined}
              >
                <text
                  fg={i() === selectedIdx() ? (sessionIdx() < 0 ? theme.background : theme.text) : theme.text}
                  bold
                >
                  {expandedDir() === proj.directory ? "▼" : i() === selectedIdx() ? "▶" : " "}
                </text>
                <text fg={i() === selectedIdx() && sessionIdx() < 0 ? theme.background : theme.text}>
                  {shortDir(proj.directory)}
                </text>
                <text fg={theme.textMuted}>
                  {proj.sessions.length} sessões
                </text>
                <Show when={proj.directory === currentDir()}>
                  <text fg={theme.success}>●</text>
                </Show>
              </box>
              <Show when={expandedDir() === proj.directory}>
                <For each={proj.sessions.slice(0, 5)}>
                  {(sess, j) => (
                    <box
                      flexDirection="row"
                      gap={2}
                      paddingLeft={4}
                      backgroundColor={i() === selectedIdx() && j() === sessionIdx() ? theme.accent : undefined}
                    >
                      <text
                        fg={i() === selectedIdx() && j() === sessionIdx() ? theme.background : theme.textMuted}
                      >
                        ↳
                      </text>
                      <text
                        fg={i() === selectedIdx() && j() === sessionIdx() ? theme.background : theme.text}
                      >
                        {sess.title || "(sem título)"}
                      </text>
                      <text fg={theme.textMuted}>
                        {timeAgo(sess.time.updated)}
                      </text>
                    </box>
                  )}
                </For>
              </Show>
            </box>
          )}
        </For>
      </box>
      <box flexShrink={0} paddingTop={1}>
        <text fg={theme.textMuted}>
          ↑↓ navegar  Enter abrir  → expandir  ← fechar  [N] Nova pasta
        </text>
      </box>
    </box>
  )
}
