/** @jsxImportSource @opentui/solid */
import { createStore } from "solid-js/store"

export interface ArtifactStoreItem {
  id: string
  title: string
  type: string
  language?: string
  size: number
  lines: number
  tokens: number
  content: string
  preview: string
  messageId?: string
  createdAt: number
}

export function createArtifactStore() {
  const [items, setItems] = createStore<ArtifactStoreItem[]>([])

  return {
    get items() { return items },
    add(item: ArtifactStoreItem) { setItems(items.length, item) },
    remove(id: string) { setItems(items.filter((i) => i.id !== id)) },
    get(id: string) { return items.find((i) => i.id === id) },
    clear() { setItems([]) },
    total: () => items.length,
    totalTokens: () => items.reduce((sum, i) => sum + i.tokens, 0),
    totalSize: () => items.reduce((sum, i) => sum + i.size, 0),
  }
}
