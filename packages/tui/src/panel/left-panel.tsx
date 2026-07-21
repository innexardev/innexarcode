/** @jsxImportSource @opentui/solid */
import { createMemo, createSignal, Show, onMount } from "solid-js"
import { useProject } from "../context/project"
import { useSync } from "../context/sync"
import { useTheme } from "../context/theme"
import { useTuiConfig } from "../config"
import { usePluginRuntime } from "../plugin/runtime"
import { useSDK } from "../context/sdk"
import { useRoute } from "../context/route"
import { InstallationChannel, InstallationVersion } from "@opencode-ai/core/installation/version"
import { getScrollAcceleration } from "../util/scroll"
import { WorkspaceLabel } from "../component/workspace-label"
import { useTuiPaths } from "../context/runtime"
import { FileExplorer, buildFileTree } from "./explorer"
import type { FileTreeItem } from "./explorer"

export function LeftPanel(props: { sessionID: string; width: number }) {
  const pluginRuntime = usePluginRuntime()
  const project = useProject()
  const sync = useSync()
  const { theme } = useTheme()
  const tuiConfig = useTuiConfig()
  const paths = useTuiPaths()
  const sdk = useSDK()
  const route = useRoute()
  const session = createMemo(() => sync.session.get(props.sessionID))
  const scrollAcceleration = createMemo(() => getScrollAcceleration(tuiConfig))
  const workspace = () => {
    const workspaceID = session()?.workspaceID
    if (!workspaceID) return
    return project.workspace.get(workspaceID)
  }
  const [filesOpen, setFilesOpen] = createSignal(true)
  const [fileTree, setFileTree] = createSignal<FileTreeItem[]>([])
  const [filesLoading, setFilesLoading] = createSignal(true)

  async function loadFiles() {
    const dir = project.instance.directory()
    if (!dir || dir === "/root") {
      setFilesLoading(false)
      return
    }
    setFilesLoading(true)
    try {
      // Get all project files via find API
      const resp = await sdk.client.find.files({
        query: "",
        type: "file" as const,
        limit: 500,
        throwOnError: false,
      } as any)

      if (resp?.data && Array.isArray(resp.data) && resp.data.length > 0) {
        const prefix = dir.endsWith("/") ? dir : dir + "/"
        const relPaths = resp.data
          .filter((p: string) => p.startsWith(prefix))
          .map((p: string) => p.slice(prefix.length))
          .filter((p: string) => !p.startsWith(".") && !p.includes("node_modules"))
        setFileTree(buildFileTree(relPaths))
      } else {
        // Fallback: list root dir files
        const list = await sdk.client.file.list({ path: dir, throwOnError: false } as any)
        if (list?.data) {
          const names = list.data.map((e: any) => e.name)
          setFileTree(buildFileTree(names))
        }
      }
    } catch {}
    setFilesLoading(false)
  }

  // Handle file selection: attach to chat
  function handleFileSelect(path: string) {
    const dir = project.instance.directory()
    if (!dir) return
    const fullPath = path.startsWith("/") ? path : `${dir}/${path}`
    route.navigate({
      type: "session",
      sessionID: props.sessionID,
      prompt: { input: `/attach ${fullPath}`, parts: [] },
    })
  }

  onMount(loadFiles)

  return (
    <Show when={session()}>
      <box
        backgroundColor={theme.backgroundPanel}
        width={props.width}
        height="100%"
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={2}
        paddingRight={2}
      >
        <scrollbox
          flexGrow={1}
          scrollAcceleration={scrollAcceleration()}
          verticalScrollbarOptions={{
            trackOptions: {
              backgroundColor: theme.background,
              foregroundColor: theme.borderActive,
            },
          }}
        >
          <box flexShrink={0} gap={1} paddingRight={1}>
            <pluginRuntime.Slot
              name="sidebar_title"
              mode="single_winner"
              session_id={props.sessionID}
              title={session()!.title}
              share_url={session()!.share?.url}
            >
              <box gap={1}>
                <text fg={theme.text}>
                  <b>{session()!.title}</b>
                </text>
                <Show when={InstallationChannel !== "latest"}>
                  <text fg={theme.textMuted}>{props.sessionID}</text>
                </Show>
                <Show when={session()!.workspaceID}>
                  <text fg={theme.textMuted}>
                    <Show
                      when={workspace()}
                      fallback={<WorkspaceLabel type="unknown" name={session()!.workspaceID!} status="error" icon />}
                    >
                      {(item) => (
                        <WorkspaceLabel
                          type={item().type}
                          name={item().name}
                          status={project.workspace.status(item().id) ?? "error"}
                          icon
                        />
                      )}
                    </Show>
                  </text>
                </Show>
                <Show when={session()!.share?.url}>
                  <text fg={theme.textMuted}>{session()!.share!.url}</text>
                </Show>
              </box>
            </pluginRuntime.Slot>

            <pluginRuntime.Slot name="sidebar_content" session_id={props.sessionID} />

            <box>
              <box flexDirection="row" gap={1} onMouseDown={() => setFilesOpen((x) => !x)}>
                <text fg={theme.text}>{filesOpen() ? "▼" : "▶"}</text>
                <text fg={theme.text}>
                  <b>Files</b>
                </text>
                <Show when={filesLoading()}>
                  <text fg={theme.textMuted}>loading...</text>
                </Show>
                <Show when={!filesLoading() && fileTree().length > 0}>
                  <text fg={theme.textMuted}>({fileTree().length})</text>
                </Show>
              </box>
              <Show when={filesOpen()}>
                <Show when={filesLoading()}>
                  <text fg={theme.textMuted}>Scanning project files...</text>
                </Show>
                <Show when={!filesLoading() && fileTree().length > 0}>
                  <FileExplorer files={fileTree()} width={props.width - 4} onFileSelect={handleFileSelect} />
                </Show>
                <Show when={!filesLoading() && fileTree().length === 0}>
                  <text fg={theme.textMuted}>No files found</text>
                </Show>
              </Show>
            </box>
          </box>
        </scrollbox>

        <box flexShrink={0} gap={1} paddingTop={1}>
          <pluginRuntime.Slot name="sidebar_footer" mode="single_winner" session_id={props.sessionID}>
                <text fg={theme.textMuted}>
                  <span style={{ fg: theme.success }}>◆</span> <b>Eng</b>
                  <span style={{ fg: theme.text }}><b>OS</b></span>{" "}
                  <span>{InstallationVersion}</span>
                </text>
          </pluginRuntime.Slot>
        </box>
      </box>
    </Show>
  )
}
