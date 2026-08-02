/** @jsxImportSource @opentui/solid */
import { createSignal, For, Show, onMount } from "solid-js"
import { useTheme } from "../context/theme"
import { useSDK } from "../context/sdk"
import { useDialog } from "../ui/dialog"
import { readLocalAttachment } from "./prompt/local-attachment"
import path from "node:path"
import { Buffer } from "node:buffer"

const IMAGE_MIMES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/svg+xml"]

type Entry = { name: string; path: string; isDir: boolean }

/**
 * Seletor de arquivos para anexar imagens/PDFs direto no chat.
 * Navega por pastas, seleciona o arquivo e chama onAttach com o conteúdo.
 */
export function FilePicker(props: {
  onAttach: (input: { filename?: string; filepath?: string; content: string; mime: string; text?: string }) => void | Promise<void>
}) {
  const { theme } = useTheme()
  const sdk = useSDK()
  const dialog = useDialog()

  const [currentPath, setCurrentPath] = createSignal("/root")
  const [entries, setEntries] = createSignal<Entry[]>([])
  const [loading, setLoading] = createSignal(false)
  const [selected, setSelected] = createSignal<Entry | undefined>()
  const [error, setError] = createSignal("")

  async function scanDir(dir: string) {
    setLoading(true)
    setError("")
    try {
      const resp = await sdk.client.file.list({ path: dir, throwOnError: false } as any)
      const items: Entry[] = []
      if (dir !== "/") {
        items.push({ name: "..", path: path.dirname(dir) || "/", isDir: true })
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao listar diretório")
    }
    setLoading(false)
  }

  function navigateTo(p: string) {
    setCurrentPath(p)
    setSelected(undefined)
    scanDir(p)
  }

  async function attachEntry(entry: Entry) {
    if (entry.isDir) {
      navigateTo(entry.path)
      return
    }
    setLoading(true)
    setError("")
    try {
      const attachment = await readLocalAttachment(entry.path)
      if (!attachment) {
        setError("Formato não suportado. Use imagem (png/jpg/gif/webp/avif/svg) ou PDF")
        setLoading(false)
        return
      }
      if (attachment.type === "text") {
        await props.onAttach({
          filename: entry.name,
          filepath: entry.path,
          mime: attachment.mime,
          content: attachment.content,
          text: attachment.content,
        })
      } else {
        await props.onAttach({
          filename: entry.name,
          filepath: entry.path,
          mime: attachment.mime,
          content: Buffer.from(attachment.content).toString("base64"),
        })
      }
      dialog.clear()
    } catch (err) {
      setError(`Não foi possível anexar: ${err instanceof Error ? err.message : String(err)}`)
    }
    setLoading(false)
  }

  onMount(() => {
    scanDir("/root")
  })

  return (
    <box flexDirection="column" paddingLeft={2} paddingRight={2} width="100%" minHeight={10}>
      <text fg={theme.primary}><b>Anexar imagem/arquivo</b></text>
      <text fg={theme.textMuted}>{currentPath()}</text>
      <text fg={theme.textMuted}>{"\u2500".repeat(50)}</text>

      <Show when={loading()}>
        <text fg={theme.textMuted}>Carregando...</text>
      </Show>
      <Show when={error()}>
        <text fg={theme.error}>{error()}</text>
      </Show>

      <box flexDirection="column" gap={0}>
        <For each={entries()}>
          {(entry) => (
            <box
              flexDirection="row"
              gap={1}
              paddingLeft={1}
              paddingRight={1}
              backgroundColor={selected()?.path === entry.path ? theme.primary : undefined}
              onMouseMove={() => setSelected(entry)}
              onMouseUp={() => attachEntry(entry)}
            >
              <text fg={entry.isDir ? theme.accent : theme.text}>
                {entry.isDir ? "📁" : IMAGE_MIMES.includes(entry.name.toLowerCase().endsWith(".svg") ? "image/svg+xml" : "x") && !entry.name.includes(".") ? "" : "📄"}
              </text>
              <text fg={entry.isDir ? theme.accent : theme.text}>
                {entry.name}
              </text>
            </box>
          )}
        </For>
      </box>

      <text fg={theme.textMuted} paddingTop={1}>
        Clique em uma pasta para navegar · Clique em um arquivo para anexar (imagem/PDF)
      </text>
    </box>
  )
}
