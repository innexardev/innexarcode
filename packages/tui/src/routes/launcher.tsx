/** @jsxImportSource @opentui/solid */
import { createMemo, createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { useTheme } from "../context/theme"
import { useSync } from "../context/sync"
import { useRoute } from "../context/route"
import { useBindings } from "../keymap"
import { readdirSync, statSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { join, sep } from "node:path"
import { Database } from "bun:sqlite"
import { Global } from "@opencode-ai/core/global"
import { InstallationChannel } from "@opencode-ai/core/installation/version"

type SessionRow = { id: string; title: string; directory: string; time_updated: number }
type ProjectGroup = { directory: string; label: string; sessions: SessionRow[]; lastTime: number }

function fuzzyScore(q: string, t: string): number {
  if (!q) return 1; const a = q.toLowerCase(); const b = t.toLowerCase()
  if (b === a) return 2; if (b.startsWith(a)) return 1.5; if (b.includes(a)) return 1
  let qi = 0; for (let ti = 0; ti < b.length && qi < a.length; ti++) { if (b[ti] === a[qi]) qi++ }
  return qi === a.length ? 0.5 : 0
}

function truncPath(p: string, m: number): string {
  if (p.length <= m) return p; const parts = p.split(sep)
  if (parts.length <= 2) return p.slice(0, m - 3) + "..."
  const last = parts[parts.length - 1]; const first = parts[0]
  const mid = parts.slice(1, -1).join(sep); const r = m - first.length - last.length - 5
  if (r < 4) return first + sep + "..." + sep + last
  return mid.length <= r ? first + sep + mid + sep + last : first + sep + mid.slice(0, r) + "..." + sep + last
}

function timeAgo(ts: number): string {
  const d = Date.now() - ts
  if (d < 60000) return "agora"; if (d < 3600000) return `${Math.floor(d / 60000)}m`
  if (d < 86400000) return `${Math.floor(d / 3600000)}h`; if (d < 604800000) return `${Math.floor(d / 86400000)}d`
  const t = new Date(ts)
  return `${t.getDate().toString().padStart(2, "0")}/${(t.getMonth() + 1).toString().padStart(2, "0")}`
}

export function LauncherView() {
  const { theme } = useTheme(); const route = useRoute()
  const [sel, setSel] = createSignal(0)
  const [filter, setFilter] = createSignal("")
  const [browseMode, setBrowseMode] = createSignal<"list" | "browse">("list")
  const [browsePath, setBrowsePath] = createSignal("")
  const [browseDirs, setBrowseDirs] = createSignal<string[]>([])
  const [showHidden, setShowHidden] = createSignal(false)
  const [expanded, setExpanded] = createSignal<Set<string>>(new Set())
  const [newProject, setNewProject] = createSignal(false)
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal("")

  // Same DB resolution as packages/core/src/database/database.ts path()
  // IMPORTANT: reading a different DB than the running instance makes sessions
  // fail with "conversa não encontrada" when clicked.
  function resolveDbPath(): string | undefined {
    const flag = process.env.OPENCODE_DB
    if (flag) {
      if (flag === ":memory:" || flag.startsWith("/")) return flag === ":memory:" ? undefined : flag
      return join(Global.Path.data, flag)
    }
    if (
      ["latest", "beta", "prod"].includes(InstallationChannel) ||
      process.env.OPENCODE_DISABLE_CHANNEL_DB === "1" ||
      process.env.OPENCODE_DISABLE_CHANNEL_DB === "true"
    ) {
      return join(Global.Path.data, "opencode.db")
    }
    return join(Global.Path.data, `opencode-${InstallationChannel.replace(/[^a-zA-Z0-9._-]/g, "-")}.db`)
  }

  const dbPath = resolveDbPath()

  const [sessions, { refetch }] = createResource(async () => {
    setLoading(true); setError("")
    try {
      const db = typeof dbPath === 'string' ? new Database(dbPath, { readonly: true }) : null
      if (!db) { setLoading(false); setError("Database em memória não suportado no Launcher"); return [] as SessionRow[] }
      const rows = db.query(`SELECT id, title, directory, time_updated FROM session WHERE time_archived IS NULL ORDER BY time_updated DESC LIMIT 200`).all() as SessionRow[]
      db.close(); setLoading(false); return rows
    } catch (e) {
      setLoading(false); setError("Erro ao carregar sessões"); return [] as SessionRow[]
    }
  })

  onMount(() => { const i = setInterval(() => refetch(), 30000); onCleanup(() => clearInterval(i)) })

  const groups = createMemo(() => {
    const list = sessions(); if (!list?.length) return [] as ProjectGroup[]
    const map = new Map<string, ProjectGroup>()
    for (const s of list) { if (!s.directory) continue
      let g = map.get(s.directory)
      if (!g) { g = { directory: s.directory, label: s.directory.split(sep).pop() || s.directory, sessions: [], lastTime: 0 }; map.set(s.directory, g) }
      g.sessions.push(s); if (s.time_updated > g.lastTime) g.lastTime = s.time_updated }
    let r = [...map.values()].sort((a, b) => b.lastTime - a.lastTime); const q = filter().trim()
    if (q) r = r.map(g => ({ ...g, sessions: g.sessions.filter(s => fuzzyScore(q, g.label) > 0 || fuzzyScore(q, s.title) > 0 || fuzzyScore(q, g.directory) > 0) })).filter(g => g.sessions.length > 0)
    return r
  })

  // Build flat list for rendering. NO exit() calls for session items.
  const items = createMemo(() => {
    const gs = groups(); const exp = expanded(); const q = filter().trim()
    type I = { kind: "group" | "session" | "openfolder" | "newproject"; g: ProjectGroup; s?: SessionRow }
    const result: I[] = []
    for (const g of gs) {
      const open = !!q || exp.has(g.directory)
      result.push({ kind: "group", g })
      if (open) {
        for (const s of g.sessions) result.push({ kind: "session", g, s })
      }
    }
    if (!q) { result.push({ kind: "openfolder", g: gs[0] || { directory: "", label: "", sessions: [], lastTime: 0 } }); result.push({ kind: "newproject", g: gs[0] || { directory: "", label: "", sessions: [], lastTime: 0 } }) }
    return result
  })

  const total = createMemo(() => items().length)

  function toggle(dir: string) { const n = new Set(expanded()); n.has(dir) ? n.delete(dir) : n.add(dir); setExpanded(n) }

  // ── Actions ──
  // Core rule: NO exit() calls. Everything navigates in-app.

  function openSession(s: SessionRow) {
    route.navigate({ type: "session", sessionID: s.id })
  }

  function openDir(dir: string) {
    // Find most recent session in this dir, or go to home
    const all = sessions()
    if (all) {
      const match = all.filter(s => s.directory === dir).sort((a, b) => b.time_updated - a.time_updated)
      if (match.length > 0) { route.navigate({ type: "session", sessionID: match[0].id }); return }
    }
    route.navigate({ type: "home" })
  }

  function handleEnter() {
    if (browseMode() === "browse") {
      if (newProject()) { createNewProject(); return }
      openDir(browsePath())
      return
    }
    const item = items()[sel()]; if (!item) return
    if (item.kind === "group") { toggle(item.g.directory); return }
    if (item.kind === "session" && item.s) { openSession(item.s); return }
    if (item.kind === "openfolder") { startBrowse(); return }
    if (item.kind === "newproject") { startNewProject(); return }
  }

  // ── Browse ──
  function startBrowse() { setBrowsePath(homedir()); loadDirs(homedir()); setBrowseMode("browse") }
  function startNewProject() { setNewProject(true); setBrowsePath(homedir()); loadDirs(homedir()); setBrowseMode("browse") }
  function createNewProject() {
    const parent = browsePath(); const fullPath = join(parent, "novo-projeto")
    try { mkdirSync(fullPath, { recursive: true }) } catch { return }
    openDir(fullPath)
  }
  function loadDirs(dir: string) {
    try { setBrowseDirs(readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).filter(n => showHidden() || !n.startsWith(".")).sort()) } catch { setBrowseDirs([]) }
  }
  function browseUp() { const p = join(browsePath(), ".."); setBrowsePath(p); loadDirs(p) }
  function browseEnter(n: string) { const f = join(browsePath(), n); try { if (statSync(f).isDirectory()) { setBrowsePath(f); loadDirs(f) } } catch {} }

  useBindings(() => ({
    bindings: [
      { key: "up", desc: "Cima", group: "Launcher", cmd: () => setSel(i => Math.max(0, i - 1)) },
      { key: "down", desc: "Baixo", group: "Launcher", cmd: () => setSel(i => Math.min(total() - 1, i + 1)) },
      { key: "return", desc: "Abrir / expandir", group: "Launcher", cmd: () => handleEnter() },
      { key: "escape", desc: "Voltar", group: "Launcher", cmd: () => { if (browseMode() === "browse") { if (newProject()) setNewProject(false); setBrowseMode("list"); setFilter("") } else route.navigate({ type: "home" }) } },
      { key: "n", desc: "Ir para home", group: "Launcher", cmd: () => route.navigate({ type: "home" }) },
      { key: "r", desc: "Atualizar", group: "Launcher", cmd: () => refetch() },
      { key: "backspace", desc: "Voltar / apagar", group: "Launcher", cmd: () => { if (browseMode() === "browse") browseUp(); else if (filter().length > 0) setFilter(f => f.slice(0, -1)) } },
      { key: "left", desc: "Colapsar", group: "Launcher", cmd: () => {
        if (browseMode() === "browse") browseUp()
        else { const item = items()[sel()]; if (item && expanded().has(item.g.directory)) toggle(item.g.directory) }
      } },
      { key: "right", desc: "Expandir", group: "Launcher", cmd: () => {
        if (browseMode() === "list") { const item = items()[sel()]; if (item && !expanded().has(item.g.directory)) toggle(item.g.directory) }
      } },
      { key: "o", desc: "Abrir pasta", group: "Launcher", cmd: () => { if (browseMode() === "list") startBrowse() } },
      { key: "h", desc: "Ocultos", group: "Launcher", cmd: () => { setShowHidden(s => !s); if (browseMode() === "browse") loadDirs(browsePath()) } },
    ],
  }))

  const totalVisible = createMemo(() => { const q = filter().trim(); return q ? groups().reduce((a, g) => a + g.sessions.length, 0) : sessions()?.length ?? 0 })

  return (
    <box flexGrow={1} flexDirection="column" padding={1}>
      <box height={1} />
      <text fg={theme.accent}>iNNEXARCode</text>
      <Show when={newProject()}>
        <text fg={theme.textMuted}>Novo projeto em: escolha o diretório-pai e pressione Enter</text>
      </Show>
      <Show when={!newProject()}>
        <box flexDirection="row" gap={1} paddingTop={1}>
          <text fg={theme.accent}>Buscar:</text>
          <text fg={theme.text}>{filter() || "..."}</text>
          <text fg={theme.textMuted}>[{totalVisible()} resultados]</text>
        </box>
      </Show>
      <box height={1} />

      {/* ── Browse mode ── */}
      <Show when={browseMode() === "browse"}>
        <text fg={theme.text}>Pastas</text>
        <text fg={theme.textMuted}>{truncPath(browsePath(), 60)}</text>
        <box height={1} />
        <box flexGrow={1} flexDirection="column" gap={0}>
          <For each={browseDirs()}>{(dir, i) => {
            const s = i() === sel()
            return <box flexDirection="row" gap={2} paddingLeft={1} paddingRight={1}
              backgroundColor={s ? theme.accent : undefined}
              onMouseUp={() => browseEnter(dir)}>
              <text fg={s ? theme.background : theme.text}>{dir}</text>
            </box>
          }}</For>
        </box>
        <box flexShrink={0} paddingTop={1}>
          <text fg={theme.textMuted}>
            ↑↓ navegar  Enter confirma  ← sobe  Esc volta  H ocultos
          </text>
        </box>
      </Show>

      {/* ── List mode ── */}
      <Show when={browseMode() === "list"}>
        <Show when={loading()}>
          <text fg={theme.textMuted}>Carregando sessões...</text>
        </Show>
        <Show when={!loading() && error()}>
          <text fg={theme.error}>{error()}</text>
        </Show>
        <Show when={!loading() && !error() && groups().length === 0}>
          <text fg={theme.textMuted}>Nenhuma sessão encontrada. Crie um novo projeto ou abra uma pasta.</text>
        </Show>
        <Show when={!loading() && !error() && groups().length > 0}>
        <box flexGrow={1} flexDirection="column" gap={0}>
          <For each={items()}>{(item, i) => {
            const s = i() === sel()
            if (item.kind === "group") return (
              <box flexDirection="row" gap={1} paddingLeft={1} paddingRight={1}
                backgroundColor={s ? theme.accent : undefined}
                onMouseUp={() => toggle(item.g.directory)}>
                <text fg={s ? theme.background : theme.text}>
                  {expanded().has(item.g.directory) ? "▼" : "▶"}
                </text>
                <text fg={s ? theme.background : theme.text}>{item.g.label}</text>
                <text fg={s ? theme.background : theme.textMuted}>
                  ({item.g.sessions.length} sessões) {timeAgo(item.g.lastTime)}
                </text>
              </box>
            )
            if (item.kind === "session" && item.s) {
              return (
                <box flexDirection="row" gap={1} paddingLeft={3} paddingRight={1}
                  backgroundColor={s ? theme.accent : undefined}
                  onMouseUp={() => openSession(item.s!)}>
                  <text fg={s ? theme.background : theme.text}>↳</text>
                  <text fg={s ? theme.background : theme.text}
                    wrapMode="none" maxWidth={40}>
                    {item.s.title || "(sem título)"}
                  </text>
                  <text fg={s ? theme.background : theme.textMuted}>{timeAgo(item.s.time_updated)}</text>
                </box>
              )
            }
            if (item.kind === "openfolder") return (
              <box flexDirection="row" gap={1} paddingLeft={1} paddingRight={1}
                backgroundColor={s ? theme.accent : undefined}
                onMouseUp={() => startBrowse()}>
                <text fg={s ? theme.background : theme.text}>📁</text>
                <text fg={s ? theme.background : theme.text}>Abrir pasta...</text>
              </box>
            )
            if (item.kind === "newproject") return (
              <box flexDirection="row" gap={1} paddingLeft={1} paddingRight={1}
                backgroundColor={s ? theme.accent : undefined}
                onMouseUp={() => startNewProject()}>
                <text fg={s ? theme.background : theme.text}>✨</text>
                <text fg={s ? theme.background : theme.text}>Novo projeto...</text>
              </box>
            )
            return null
          }}</For>
        </box>
        </Show>
        <box flexShrink={0} paddingTop={1}>
          <text fg={theme.textMuted}>
            ↑↓ navegar  → expandir  ← colapsar  Enter abrir  O abrir pasta  N home  Esc voltar
          </text>
        </box>
      </Show>
    </box>
  )
}
