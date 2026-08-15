import * as cp from "child_process"
import * as path from "path"
import * as fs from "fs"
import * as vscode from "vscode"

const OUTPUT_CHANNEL_NAME = "InnexarCode"
const TERMINAL_NAME = "InnexarCode"
const DEFAULT_PORT = 16384
const PORT_RANGE = 65535

/* eslint-disable @typescript-eslint/consistent-type-definitions */

// ---------------------------------------------------------------------------
// Shared contract types (host <-> webview)
// ---------------------------------------------------------------------------

interface ChatMessagePart {
  type: string
  text?: string
}

interface ServerInfo {
  connected: boolean
  port: number
  version?: string
  error?: string
}

interface SessionInfo {
  id: string
  title?: string
  directory?: string
  [key: string]: unknown
}

interface ServerEventPayload {
  type: string
  properties?: Record<string, unknown>
  [key: string]: unknown
}

interface HITLRequest {
  id: string
  type: "file_write" | "tool_execution"
  title: string
  details: string
  path?: string
  sessionID?: string
  messageID?: string
}

interface SnapshotFileDiff {
  file?: string
  patch?: string
  additions: number
  deletions: number
  status?: "added" | "deleted" | "modified"
}

type HostToWebviewMessage =
  | { type: "init"; settings: Record<string, unknown>; server: ServerInfo }
  | { type: "index.server_error"; message: string }
  | { type: "session_created"; session: SessionInfo }
  | { type: "session_list"; sessions: SessionInfo[] }
  | { type: "message_parts"; sessionID: string; messageID: string; role: string; parts: ChatMessagePart[] }
  | { type: "chat_response_finish"; sessionID: string }
  | { type: "chat_error"; message: string }
  | { type: "event"; sessionID: string; event: ServerEventPayload }
  | { type: "hitl_request"; request: HITLRequest }
  | { type: "pipeline_status"; phase: string; status: string }
  | { type: "pipeline_update"; message: string }

type WebviewToHostMessage =
  | { type: "webview_ready" }
  | { type: "send_prompt"; text: string; persona?: string; provider?: string; model?: string }
  | { type: "list_sessions" }
  | { type: "create_session"; title?: string }
  | { type: "abort_session"; sessionID?: string }
  | { type: "apply_patch"; sessionID: string; messageID?: string; patchID?: string; diffs?: SnapshotFileDiff[]; code?: string; language?: string }
  | { type: "hitl_response"; id: string; approved: boolean; always?: boolean }
  | { type: "approve_prompt"; id: string; approved?: boolean }
  | { type: "deny_prompt"; id: string }
  | { type: "update_settings"; aiProvider?: string; aiModel?: string; settings?: Record<string, unknown> }
  | { type: "save_settings"; aiProvider?: string; aiModel?: string; settings?: Record<string, unknown> }
  | { type: "pipeline_run" }
  | { type: "pipeline_cancel" }
  | { type: "pipeline_phase" }

// ---------------------------------------------------------------------------
// Unified-diff application (as produced by snapshot structured patches)
// ---------------------------------------------------------------------------

function applyUnifiedPatch(original: string, patch: string): string | null {
  const patchLines = patch.split(/\r?\n/)
  const originalLines = original.split(/\r?\n/)
  const result = originalLines.slice()

  let hunk: string[] = []
  let inHunk = false
  let patchIndex = 0
  let offset = 0

  while (patchIndex < patchLines.length) {
    const line = patchLines[patchIndex]
    if (/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/.test(line)) {
      if (inHunk) {
        const applied = applyHunk(result, hunk, offset)
        if (applied === null) {
          return null
        }
        offset = applied
        hunk = []
      }
      inHunk = true
      hunk = [line]
      patchIndex += 1
      continue
    }
    if (inHunk) {
      hunk.push(line)
    }
    patchIndex += 1
  }

  if (inHunk) {
    const applied = applyHunk(result, hunk, offset)
    if (applied === null) {
      return null
    }
  }

  return result.join("\n")
}

function applyHunk(result: string[], hunk: string[], offset: number): number | null {
  const header = hunk[0]
  const match = /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/.exec(header)
  if (!match) {
    return null
  }
  const oldStart = Number(match[1])
  let oldPos = oldStart - 1
  const insertPos = oldPos + offset

  const body: string[] = []
  let deleted = 0
  let added = 0
  for (let i = 1; i < hunk.length; i += 1) {
    const line = hunk[i]
    if (line.startsWith(" ")) {
      if (result[insertPos + deleted] === undefined) {
        return null
      }
      body.push(result[insertPos + deleted])
      oldPos += 1
    } else if (line.startsWith("-")) {
      if (result[insertPos + deleted] === undefined) {
        return null
      }
      deleted += 1
    } else if (line.startsWith("+")) {
      body.push(line.slice(1))
      added += 1
    } else if (line.startsWith("\\")) {
      continue
    } else {
      return null
    }
  }

  result.splice(insertPos, deleted, ...body)
  return offset + (added - deleted)
}

// ---------------------------------------------------------------------------
// Server manager — spawns the real EngOS server, relays /event over SSE
// ---------------------------------------------------------------------------

class ServerManager implements vscode.Disposable {
  readonly port: number
  readonly engineDir: string
  readonly workspaceDir: string
  readonly outputChannel: vscode.OutputChannel

  private readonly _username: string
  private readonly _password: string | undefined
  private _process: cp.ChildProcess | undefined
  private _spawnFailed = false
  private _version: string | undefined
  private _abortStream: AbortController | undefined
  private _disposed = false

  constructor(wsp: string, engineDir: string, outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel
    this.engineDir = engineDir
    this.workspaceDir = wsp
    const config = vscode.workspace.getConfiguration("innexarcode")
    this._password = config.get<string | undefined>("serverPassword", undefined)
    this._username = config.get<string>("serverUsername", "opencode")
    this.port = ServerManager.pickPort()
    this.start()
  }

  private static pickPort(): number {
    return DEFAULT_PORT + Math.floor(Math.random() * (PORT_RANGE - DEFAULT_PORT - 1))
  }

  get server(): ServerInfo {
    return {
      connected: this.isRunning,
      port: this.port,
      version: this._version,
      error: this._spawnFailed ? "Server failed to start" : undefined,
    }
  }

  get isRunning(): boolean {
    return this._process !== undefined && this._process.exitCode === null && !this._disposed
  }

  get spawnFailed(): boolean {
    return this._spawnFailed
  }

  get authHeaders(): Record<string, string> {
    if (!this._password) {
      return {}
    }
    const token = Buffer.from(`${this._username}:${this._password}`).toString("base64")
    return { Authorization: `Basic ${token}` }
  }

  get directoryQuery(): string {
    return `directory=${encodeURIComponent(this.workspaceDir)}`
  }

  private start(): void {
    const serverPort = this.port
    const cwd = this.workspaceDir
    const env: Record<string, string | undefined> = {
      ...process.env,
      _EXTENSION_INNEXARCODE_PORT: serverPort.toString(),
      INNEXARCODE_CALLER: "vscode",
      _INNEXARCODE_AGENT_WRITE: "1",
    }
    if (this._password) {
      env.OPENCODE_SERVER_PASSWORD = this._password
      env.OPENCODE_SERVER_USERNAME = this._username
    }

    const args = [
      "run",
      "--conditions=browser",
      "./src/index.ts",
      "run",
      "--port",
      serverPort.toString(),
      "--directory",
      cwd,
    ]

    this.outputChannel.clear()
    this.outputChannel.appendLine(`Starting server on port ${this.port}`)
    this.outputChannel.appendLine(`bun ${args.join(" ")}`)

    try {
      this._process = cp.spawn(
        (globalThis as { Bun?: { which(name: string): string | null } }).Bun?.which("bun") || "bun",
        ["run", "--conditions=browser", "./src/index.ts", "run", "--port", serverPort.toString(), "--directory", cwd],
        {
          cwd: this.engineDir,
          env,
          shell: true,
          windowsHide: true,
        },
      )

      this._process.stdout?.on("data", (data: Buffer) => {
        this.outputChannel.append(data.toString())
      })
      this._process.stderr?.on("data", (data: Buffer) => {
        this.outputChannel.append(data.toString())
      })
      this._process.on("error", (err) => {
        this._spawnFailed = true
        this.outputChannel.appendLine(`[spawn error] ${err.message}`)
      })
      this._process.on("exit", (code) => {
        if (!this._disposed && code !== 0 && code !== null) {
          this._spawnFailed = true
          this.outputChannel.appendLine(`[server exited with code ${code}]`)
        }
      })

      this._version = this.readEngineVersion()
    } catch (err) {
      this._spawnFailed = true
      this.outputChannel.appendLine(`[spawn error] ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private readEngineVersion(): string | undefined {
    try {
      const pkgPath = path.join(this.engineDir, "..", "..", "package.json")
      const manifest = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { version?: string }
      return manifest.version ? `v${manifest.version}` : undefined
    } catch {
      return undefined
    }
  }

  /** Start relaying server events as SSE. Reconnects with backoff, aborts on switch/dispose. */
  startEventStream(onEvent: (event: ServerEventPayload) => void): void {
    this._abortStream?.abort()
    const controller = new AbortController()
    this._abortStream = controller

    const connect = async (attempt: number): Promise<void> => {
      if (controller.signal.aborted || this._disposed || !this.isRunning) {
        return
      }
      const url = `http://localhost:${this.port}/event?${this.directoryQuery}`
      try {
        const res = await fetch(url, {
          headers: { Accept: "text/event-stream", ...this.authHeaders },
          signal: controller.signal,
        })
        if (!res.ok || !res.body) {
          throw new Error(`event stream HTTP ${res.status}`)
        }
        attempt = 0
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        for (;;) {
          const { done, value } = await reader.read()
          if (done) {
            break
          }
          buffer += decoder.decode(value, { stream: true })
          const frames = buffer.split(/\r?\n\r?\n/)
          buffer = frames.pop() ?? ""
          for (const frame of frames) {
            const event = ServerManager.parseSseFrame(frame)
            if (event) {
              onEvent(event)
            }
          }
        }
      } catch (err) {
        if (controller.signal.aborted || this._disposed) {
          return
        }
        if (err instanceof Error && err.name === "AbortError") {
          return
        }
        const delay = Math.min(1000 * 2 ** Math.min(attempt, 4), 10000)
        this.outputChannel.appendLine(`[event stream retry in ${delay}ms: ${err instanceof Error ? err.message : String(err)}]`)
        setTimeout(() => void connect(attempt + 1), delay)
        return
      }
      if (!controller.signal.aborted && !this._disposed) {
        setTimeout(() => void connect(attempt + 1), 1000)
      }
    }

    void connect(0)
  }

  stopEventStream(): void {
    this._abortStream?.abort()
    this._abortStream = undefined
  }

  private static parseSseFrame(frame: string): ServerEventPayload | null {
    let data = ""
    let eventName = ""
    for (const line of frame.split(/\r?\n/)) {
      if (line.startsWith("data:")) {
        data = line.slice(5).trimStart()
      } else if (line.startsWith("event:")) {
        eventName = line.slice(6).trimStart()
      }
    }
    if (!data) {
      return null
    }
    let payload: unknown
    try {
      payload = JSON.parse(data)
    } catch {
      return null
    }
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload)
      } catch {
        return null
      }
    }
    if (!payload || typeof payload !== "object") {
      return null
    }
    const obj = payload as Record<string, unknown>
    if (eventName === "error") {
      return { type: "server.error", properties: { message: String(obj.message ?? "server error") } }
    }
    const type = typeof obj.type === "string" ? obj.type : "message"
    const properties = typeof obj.properties === "object" && obj.properties !== null ? (obj.properties as Record<string, unknown>) : {}
    return { type, properties, ...obj }
  }

  dispose(): void {
    this._disposed = true
    this.stopEventStream()
    if (this._process && this._process.exitCode === null) {
      try {
        this._process.kill("SIGKILL")
      } catch {
        /* already dead */
      }
    }
    this._process = undefined
  }

  /** Process the full "session.next.*" style event and extract parts for a relay. */
  toParts(event: ServerEventPayload): { messageID: string; role: string; parts: ChatMessagePart[] } | null {
    const props = event.properties ?? {}
    const msgObj = props.message && typeof props.message === "object" ? (props.message as Record<string, unknown>) : undefined
    const messageID = typeof msgObj?.id === "string" ? msgObj.id : typeof props.messageID === "string" ? props.messageID : ""
    const role = typeof msgObj?.role === "string" ? msgObj.role : typeof props.role === "string" ? props.role : "assistant"
    const parts: ChatMessagePart[] = []
    if (Array.isArray(props.parts)) {
      for (const part of props.parts) {
        if (part && typeof part === "object") {
          const p = part as Record<string, unknown>
          const text = typeof p.text === "string" ? p.text : undefined
          parts.push({ type: typeof p.type === "string" ? p.type : "text", text })
        }
      }
    }
    if (!messageID && parts.length === 0) {
      return null
    }
    return { messageID, role, parts }
  }
}

// ---------------------------------------------------------------------------
// Webview provider — wires the chat webview to the real server
// ---------------------------------------------------------------------------

class InnexarCodeChatWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "innexarcode.chatView"

  private _view: vscode.WebviewView | undefined
  private _ready = false
  private _pendingHostMessages: HostToWebviewMessage[] = []
  private _pendingWebviewMessages: WebviewToHostMessage[] = []
  private _activeSessionID: string | undefined
  private _sessionList: SessionInfo[] = []
  private _pendingApproval: HITLRequest | undefined

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _server: ServerManager,
    private readonly _extensionContext: vscode.ExtensionContext,
  ) {}

  /**
   * Send a message to the webview, buffering until it is ready.
   */
  send(message: HostToWebviewMessage): void {
    if (!this._view) {
      return
    }
    if (!this._ready) {
      this._pendingHostMessages.push(message)
      return
    }
    void this._view.webview.postMessage(message)
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView
    webviewView.webview.options = {
      enableScripts: true,
    }
    webviewView.webview.html = this._html()

    webviewView.webview.onDidReceiveMessage((data: WebviewToHostMessage) => {
      if (!this._ready && data.type !== "webview_ready" && data.type !== "send_prompt") {
        this._pendingWebviewMessages.push(data)
        return
      }
      this.handleWebviewMessage(data)
    })
  }

  handleWebviewMessage(msg: WebviewToHostMessage): void {
    switch (msg.type) {
      case "webview_ready":
        this.handleReady()
        break
      case "send_prompt":
        void this.handleSendPrompt(msg)
        break
      case "list_sessions":
        void this.handleListSessions()
        break
      case "create_session":
        void this.handleCreateSession(msg)
        break
      case "abort_session":
        void this.handleAbortSession(msg)
        break
      case "apply_patch":
        if (msg.code) {
          void this.handleApplyCode(msg)
        } else {
          void this.handleApplyPatch(msg)
        }
        break
      case "hitl_response":
      case "approve_prompt":
        this.resolveApproval(msg.id, msg.type === "approve_prompt" ? !!msg.approved : msg.approved)
        break
      case "deny_prompt":
        this.resolveApproval(msg.id, false)
        break
      case "update_settings":
      case "save_settings":
        this.handleSettingsSave(msg)
        break
      case "pipeline_run":
        this.send({ type: "pipeline_status", phase: "noop", status: "noop" })
        this.send({ type: "pipeline_update", message: "Pipeline not available over the InnexarCode server." })
        break
      case "pipeline_cancel":
        this.send({ type: "pipeline_status", phase: "noop", status: "cancelled" })
        break
      case "pipeline_phase":
        this.send({ type: "pipeline_status", phase: "noop", status: "noop" })
        break
      default:
        break
    }
  }

  private handleReady(): void {
    this._ready = true
    void this._view?.webview.postMessage({
      type: "init",
      settings: this.readSettings(),
      server: this._server.server,
    } satisfies HostToWebviewMessage)

    if (this._server.spawnFailed) {
      this.send({ type: "index.server_error", message: "Failed to start the InnexarCode server." })
    }

    const queued = this._pendingWebviewMessages
    this._pendingWebviewMessages = []
    for (const pending of queued) {
      this.handleWebviewMessage(pending)
    }
    const queuedHost = this._pendingHostMessages
    this._pendingHostMessages = []
    for (const pending of queuedHost) {
      this.send(pending)
    }
  }

  private readSettings(): Record<string, unknown> {
    const config = vscode.workspace.getConfiguration("innexarcode")
    return {
      aiProvider: config.get<string>("aiProvider", "opencode"),
      aiModel: config.get<string>("aiModel", ""),
    }
  }

  private handleSettingsSave(msg: { aiProvider?: string; aiModel?: string; settings?: Record<string, unknown> }): void {
    const config = vscode.workspace.getConfiguration("innexarcode")
    const provider = msg.aiProvider ?? (msg.settings?.aiProvider as string | undefined)
    const model = msg.aiModel ?? (msg.settings?.aiModel as string | undefined)
    if (provider) {
      void config.update("aiProvider", provider, vscode.ConfigurationTarget.Global)
    }
    if (model) {
      void config.update("aiModel", model, vscode.ConfigurationTarget.Global)
    }
    this.send({ type: "init", settings: this.readSettings(), server: this._server.server })
  }

  private readonly _api = {
    base: (): string => `http://localhost:${this._server.port}`,
    sessionMessageEndpoint: (sessionID: string): string => `/session/${encodeURIComponent(sessionID)}/message`,
  }

  private async apiRequest(
    pathAndQuery: string,
    init?: RequestInit,
  ): Promise<Response> {
    const url = `${this._api.base()}${pathAndQuery}${pathAndQuery.includes("?") ? "&" : "?"}${this._server.directoryQuery}`
    return fetch(url, {
      ...init,
      headers: { Accept: "application/json", ...this._server.authHeaders, ...(init?.headers ?? {}) },
    })
  }

  private async handleSendPrompt(msg: { text: string }): Promise<void> {
    const text = msg.text?.trim()
    if (!text) {
      this.send({ type: "chat_error", message: "Empty prompt." })
      return
    }
    if (!this._server.isRunning) {
      this.send({ type: "chat_error", message: "Server is not running." })
      return
    }

    try {
      let sessionID = this._activeSessionID

      if (!sessionID) {
        const created = await this.createSessionOnServer()
        if (!created) {
          this.send({ type: "chat_error", message: "Failed to create a session." })
          return
        }
        sessionID = created
      }

      const res = await this.apiRequest(this._api.sessionMessageEndpoint(sessionID), {
        method: "POST",
        body: JSON.stringify({ text }),
        headers: { "Content-Type": "application/json" },
      })

      if (!res.ok) {
        const body = await res.text()
        this.send({ type: "chat_error", message: `Message request failed (${res.status}): ${body.slice(0, 500)}` })
        return
      }

      const parsed = (await res.json()) as {
        info?: { id?: string; role?: string }
        parts?: Array<{ type?: string; text?: string }>
      }

      const messageID = parsed.info?.id ?? ""
      const role = parsed.info?.role ?? "user"
      const parts: ChatMessagePart[] = (parsed.parts ?? []).map((p) => ({
        type: p.type ?? "text",
        text: p.text,
      }))
      this.send({ type: "message_parts", sessionID, messageID, role, parts })
      this.send({ type: "chat_response_finish", sessionID })
    } catch (err) {
      this.send({ type: "chat_error", message: err instanceof Error ? err.message : String(err) })
    }
  }

  private async createSessionOnServer(): Promise<string | undefined> {
    try {
      const res = await this.apiRequest("/session", {
        method: "POST",
        body: "{}",
        headers: { "Content-Type": "application/json" },
      })
      if (!res.ok) {
        return undefined
      }
      const session = (await res.json()) as SessionInfo
      this._activeSessionID = session.id
      this.send({ type: "session_created", session })
      return session.id
    } catch (err) {
      this._server.outputChannel.appendLine(`[create session error] ${err instanceof Error ? err.message : String(err)}`)
      return undefined
    }
  }

  private async handleListSessions(): Promise<void> {
    try {
      const res = await this.apiRequest("/session")
      if (!res.ok) {
        this.send({ type: "session_list", sessions: [] })
        return
      }
      const sessions = (await res.json()) as SessionInfo[]
      this._sessionList = sessions
      this.send({ type: "session_list", sessions })
    } catch (err) {
      this.send({ type: "session_list", sessions: [] })
      this._server.outputChannel.appendLine(`[list sessions error] ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private async handleCreateSession(msg: { title?: string }): Promise<void> {
    try {
      const res = await this.apiRequest("/session", {
        method: "POST",
        body: msg.title ? JSON.stringify({ title: msg.title }) : "{}",
        headers: { "Content-Type": "application/json" },
      })
      if (!res.ok) {
        this.send({ type: "chat_error", message: `create session failed (${res.status})` })
        return
      }
      const session = (await res.json()) as SessionInfo
      this._activeSessionID = session.id
      this.send({ type: "session_created", session })
    } catch (err) {
      this.send({ type: "chat_error", message: err instanceof Error ? err.message : String(err) })
    }
  }

  private async handleAbortSession(msg?: { sessionID?: string }): Promise<void> {
    const sessionID = msg?.sessionID ?? this._activeSessionID
    if (!sessionID) {
      return
    }
    try {
      const res = await this.apiRequest(`/session/${encodeURIComponent(sessionID)}/abort`, { method: "POST" })
      if (!res.ok) {
        this.send({ type: "chat_error", message: `abort failed (${res.status})` })
      }
    } catch (err) {
      this.send({ type: "chat_error", message: err instanceof Error ? err.message : String(err) })
    }
  }

  // -------------------------------------------------------------------------
  // HITL / apply_patch / apply_code
  // -------------------------------------------------------------------------

  private async handleApplyCode(msg: { sessionID?: string; code?: string; language?: string }): Promise<void> {
    const code = msg.code
    if (!code) {
      return
    }
    const editor = vscode.window.activeTextEditor
    if (editor) {
      await editor.edit((editBuilder) => {
        if (editor.selection.isEmpty) {
          editBuilder.insert(editor.selection.active, code)
        } else {
          editBuilder.replace(editor.selection, code)
        }
      })
      this.send({ type: "chat_response_finish", sessionID: msg.sessionID ?? this._activeSessionID ?? "" })
      return
    }
    const workspaceFolders = vscode.workspace.workspaceFolders ?? []
    const root = workspaceFolders[0]?.uri ?? vscode.Uri.file(this._server.workspaceDir)
    const filePath = path.join(root.fsPath, "generated-code.txt")
    const uri = vscode.Uri.file(filePath)
    await vscode.workspace.fs.writeFile(uri, Buffer.from(code, "utf8"))
    const doc = await vscode.workspace.openTextDocument(uri)
    await vscode.window.showTextDocument(doc)
    this.send({ type: "chat_response_finish", sessionID: msg.sessionID ?? this._activeSessionID ?? "" })
  }

  private async handleApplyPatch(msg: { sessionID: string; messageID?: string; patchID?: string; diffs?: SnapshotFileDiff[] }): Promise<void> {
    if (!this._server.isRunning) {
      this.send({ type: "chat_error", message: "Server is not running." })
      return
    }

    if (!msg.messageID) {
      this.send({ type: "chat_error", message: "Missing message ID for patch." })
      return
    }

    const request: HITLRequest = {
      id: `hitl-${Date.now()}`,
      type: "file_write",
      title: "Apply patch to workspace",
      details: "",
      sessionID: msg.sessionID,
      messageID: msg.messageID,
    }

    try {
      let diffs = msg.diffs
      if (!diffs || diffs.length === 0) {
        const res = await this.apiRequest(
          `/session/${encodeURIComponent(msg.sessionID)}/diff?messageID=${encodeURIComponent(msg.messageID)}`,
        )
        if (!res.ok) {
          this.send({ type: "chat_error", message: `diff request failed (${res.status})` })
          return
        }
        diffs = (await res.json()) as SnapshotFileDiff[]
      }

      const fileList = (diffs ?? [])
        .map((d) => `${d.status !== "deleted" ? "M" : "D"} ${d.file ?? "(unknown)"}`)
        .join("\n")
      request.details = fileList || "No file changes."

      this._pendingApproval = request
      this.send({ type: "hitl_request", request })
    } catch (err) {
      this.send({ type: "chat_error", message: err instanceof Error ? err.message : String(err) })
    }
  }

  private resolveApproval(id: string, approved: boolean): void {
    const request = this._pendingApproval
    if (!request || request.id !== id) {
      return
    }
    this._pendingApproval = undefined
    if (!approved || !request.sessionID || !request.messageID) {
      this.send({ type: "chat_response_finish", sessionID: request.sessionID ?? this._activeSessionID ?? "" })
      return
    }
    void this.applyApprovedPatch(request, id)
  }

  private async applyApprovedPatch(request: HITLRequest, _id: string): Promise<void> {
    try {
      const res = await this.apiRequest(
        `/session/${encodeURIComponent(request.sessionID!)}/diff?messageID=${encodeURIComponent(request.messageID!)}`,
      )
      if (!res.ok) {
        this.send({ type: "chat_error", message: `diff request failed (${res.status})` })
        this.send({ type: "chat_response_finish", sessionID: request.sessionID! })
        return
      }
      const diffs = (await res.json()) as SnapshotFileDiff[]
      if (!diffs || diffs.length === 0) {
        this.send({ type: "chat_response_finish", sessionID: request.sessionID! })
        return
      }
      const results = await this.writeDiffs(diffs)
      const applied = results.filter((r) => r.status === "ok").map((r) => r.file).join(", ")
      if (results.some((r) => r.status === "error")) {
        this.send({ type: "chat_error", message: `Some files failed to apply: ${applied}` })
      }
      this.send({ type: "chat_response_finish", sessionID: request.sessionID! })
    } catch (err) {
      this.send({ type: "chat_error", message: err instanceof Error ? err.message : String(err) })
      this.send({ type: "chat_response_finish", sessionID: request.sessionID! })
    }
  }

  private async writeDiffs(diffs: SnapshotFileDiff[]): Promise<Array<{ file: string; status: "ok" | "error" }>> {
    const results: Array<{ file: string; status: "ok" | "error" }> = []
    const workspaceFolders = vscode.workspace.workspaceFolders ?? []
    const root = workspaceFolders[0]?.uri ?? vscode.Uri.file(this._server.workspaceDir)

    for (const diff of diffs) {
      if (!diff.file) {
        continue
      }
      const filePath = path.isAbsolute(diff.file) ? diff.file : path.join(root.fsPath, diff.file)
      const uri = vscode.Uri.file(filePath)
      try {
        if (diff.status === "deleted") {
          await vscode.workspace.fs.delete(uri, { recursive: false, useTrash: false })
          results.push({ file: diff.file, status: "ok" })
          continue
        }

        let original = ""
        try {
          const existing = await vscode.workspace.fs.readFile(uri)
          original = Buffer.from(existing).toString("utf8")
        } catch {
          original = ""
        }

        let content: string | null = null
        if (diff.patch) {
          content = applyUnifiedPatch(original, diff.patch)
        }
        if (content === null) {
          content = diff.status === "added" ? original : original
        }

        const dir = path.dirname(uri.fsPath)
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(dir))
        await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf8"))
        results.push({ file: diff.file, status: "ok" })
      } catch (err) {
        this._server.outputChannel.appendLine(`[apply write error ${diff.file}] ${err instanceof Error ? err.message : String(err)}`)
        results.push({ file: diff.file, status: "error" })
      }
    }
    return results
  }

  // -------------------------------------------------------------------------
  // Event relay
  // -------------------------------------------------------------------------

  /** Wire the server SSE relay to this provider. Called once when stream starts. */
  relayStreamEvent(event: ServerEventPayload): void {
    const props = event.properties ?? {}
    const eventSessionID =
      typeof props.sessionID === "string"
        ? props.sessionID
        : typeof props.session === "string"
          ? props.session
          : ""

    const sessionMatches = !eventSessionID || eventSessionID === this._activeSessionID
    const isSessionScoped = event.type.startsWith("session.")

    if (!sessionMatches && !isSessionScoped) {
      return
    }

    const relaysTo = eventSessionID || this._activeSessionID || ""
    if (!relaysTo) {
      return
    }

    const parts = this._server.toParts(event)
    if (parts && parts.parts.length > 0) {
      this.send({
        type: "message_parts",
        sessionID: relaysTo,
        messageID: parts.messageID,
        role: parts.role,
        parts: parts.parts,
      })
    }
    this.send({ type: "event", sessionID: relaysTo, event })
  }

  private _html(): string {
    const indexHtml = path.join(this._extensionUri.fsPath, "dist", "webview", "index.html")
    try {
      return fs.readFileSync(indexHtml, "utf8")
    } catch {
      const scriptUri = this._view!.webview.asWebviewUri(
        vscode.Uri.joinPath(this._extensionUri, "dist", "webview", "index.js"),
      )
      return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>InnexarCode</title>
</head>
<body>
<div id="root"></div>
<script src="${scriptUri}"></script>
</body>
</html>`
    }
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function shellQuote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`
}

function findInnexarTerminal(): vscode.Terminal | undefined {
  return vscode.window.terminals.find((t) => t.name === TERMINAL_NAME)
}

function getServerPort(config: vscode.WorkspaceConfiguration): number | undefined {
  const port = config.get<number | string>("port")
  const num = Number(port)
  return Number.isFinite(num) && num > 0 ? num : undefined
}

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME)
  context.subscriptions.push(outputChannel)

  const engineDir = path.join(context.extensionPath, "..", "..", "packages", "opencode")
  const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd()
  const server = new ServerManager(workspaceDir, engineDir, outputChannel)
  context.subscriptions.push(server)

  const provider = new InnexarCodeChatWebviewProvider(context.extensionUri, server, context)
  server.startEventStream((event) => provider.relayStreamEvent(event))
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(InnexarCodeChatWebviewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  )

  const openTerminal = vscode.commands.registerCommand("innexarcode.openTerminal", () => {
    const config = vscode.workspace.getConfiguration("innexarcode")
    const port = getServerPort(config)
    const terminal = findInnexarTerminal()
    if (terminal) {
      terminal.show()
      return
    }
    const newTerminal = vscode.window.createTerminal({ name: TERMINAL_NAME })
    const dir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd()
    newTerminal.sendText(`cd ${shellQuote(engineDir)}`)
    const portArg = port ? ` --port ${port}` : ""
    newTerminal.sendText(`bun run --conditions=browser ./src/index.ts run${portArg} --directory ${shellQuote(dir)}`)
    newTerminal.show()
  })

  const openNewTerminal = vscode.commands.registerCommand("innexarcode.openNewTerminal", () => {
    const config = vscode.workspace.getConfiguration("innexarcode")
    const port = getServerPort(config)
    const terminal = vscode.window.createTerminal({ name: TERMINAL_NAME })
    const dir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd()
    terminal.sendText(`cd ${shellQuote(engineDir)}`)
    const portArg = port ? ` --port ${port}` : ""
    terminal.sendText(`bun run --conditions=browser ./src/index.ts run${portArg} --directory ${shellQuote(dir)}`)
    terminal.show()
  })

  const addFilepathToTerminal = vscode.commands.registerCommand("innexarcode.addFilepathToTerminal", (arg?: vscode.Uri) => {
    const fileRef = arg?.fsPath ?? vscode.window.activeTextEditor?.document.uri.fsPath
    const terminal = findInnexarTerminal()
    if (fileRef && terminal) {
      terminal.sendText(JSON.stringify(fileRef))
      terminal.show()
    }
  })

  const appendPrompt = vscode.commands.registerCommand("innexarcode.appendPrompt", (text?: string) => {
    if (text) {
      provider.handleWebviewMessage({ type: "send_prompt", text })
    }
  })

  const openSettings = vscode.commands.registerCommand("innexarcode.openSettings", () => {
    void vscode.commands.executeCommand("workbench.action.openSettings", "@ext:innexarcode.tar")
  })

  context.subscriptions.push(openTerminal, openNewTerminal, addFilepathToTerminal, appendPrompt, openSettings)
}

export function deactivate(): void {
  /* server is disposed via context.subscriptions */
}
