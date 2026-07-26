export * as Artifact from "./index"

export const ARTIFACT_TYPES = [
  "code", "log", "json", "markdown", "text", "image", "pdf",
  "docx", "archive", "csv", "yaml", "xml", "sql", "diff", "error",
] as const
export type ArtifactType = (typeof ARTIFACT_TYPES)[number]

export const ARTIFACT_LANGUAGES = [
  "typescript", "javascript", "python", "rust", "go", "java",
  "sql", "json", "yaml", "xml", "markdown", "css", "scss",
  "html", "bash", "docker", "graphql", "proto",
] as const
export type ArtifactLanguage = (typeof ARTIFACT_LANGUAGES)[number]

export interface ArtifactInfo {
  id: string
  title: string
  type: ArtifactType
  language?: ArtifactLanguage
  size: number
  lines: number
  tokens: number
  content: string
  preview: string
  truncated: boolean
  meta?: Record<string, unknown>
  createdAt: number
  source?: string
}

const EXT_TO_TYPE: Record<string, ArtifactType> = {
  ts: "code", tsx: "code", js: "code", jsx: "code", mjs: "code",
  cjs: "code", py: "code", rs: "code", go: "code", java: "code",
  rb: "code", c: "code", cpp: "code", cs: "code", php: "code",
  swift: "code", kt: "code", scala: "code",
  log: "log", json: "json", md: "markdown", mdx: "markdown",
  txt: "text", png: "image", jpg: "image", jpeg: "image",
  gif: "image", svg: "image", webp: "image", ico: "image",
  bmp: "image", pdf: "pdf", docx: "docx", zip: "archive",
  tar: "archive", gz: "archive", rar: "archive", "7z": "archive",
  tgz: "archive", bz2: "archive", csv: "csv", tsv: "csv",
  yaml: "yaml", yml: "yaml", xml: "xml", sql: "sql",
  diff: "diff", patch: "diff",
}

const EXT_TO_LANG: Record<string, ArtifactLanguage> = {
  ts: "typescript", tsx: "typescript", mts: "typescript",
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  py: "python", rs: "rust", go: "go", java: "java",
  sql: "sql", json: "json", yaml: "yaml", yml: "yaml",
  xml: "xml", md: "markdown", mdx: "markdown",
  css: "css", scss: "scss", sass: "scss",
  html: "html", htm: "html",
  sh: "bash", bash: "bash", zsh: "bash",
  dockerfile: "docker",
  graphql: "graphql", gql: "graphql",
  proto: "proto",
}

const TOKEN_FACTORS: Partial<Record<ArtifactLanguage | ArtifactType, number>> = {
  typescript: 1.8, javascript: 1.8, python: 2.0, rust: 1.5, go: 1.5,
  java: 2.0, sql: 2.5, json: 2.0, yaml: 2.5, xml: 2.0, markdown: 4.0,
  css: 1.5, scss: 1.5, html: 2.0, bash: 2.5, docker: 2.0, graphql: 2.0,
  proto: 1.8, log: 5.0, text: 4.0, diff: 2.0, csv: 4.0,
}

const LANG_ICONS: Record<ArtifactLanguage, string> = {
  typescript: "TS", javascript: "JS", python: "Py", rust: "Rs",
  go: "Go", java: "Jv", sql: "SQL", json: "{}", yaml: "Ym",
  xml: "XML", markdown: "MD", css: "CSS", scss: "SCS", html: "HTML",
  bash: ">$", docker: "DK", graphql: "GQL", proto: "PB",
}

const TYPE_ICONS: Record<ArtifactType, string> = {
  code: "<>", log: "LN", json: "{}", markdown: "MD", text: "Tx",
  image: "IMG", pdf: "PDF", docx: "DOC", archive: "ZIP", csv: "CS",
  yaml: "YM", xml: "XML", sql: "SQL", diff: "DF", error: "!!",
}

export function detectArtifactType(content: string, filename?: string): ArtifactType {
  if (filename) {
    const ext = filename.split(".").pop()?.toLowerCase()
    if (ext && ext in EXT_TO_TYPE) return EXT_TO_TYPE[ext]
    const base = filename.split("/").pop()?.toLowerCase() ?? ""
    if (base === "dockerfile") return "code"
  }
  const firstLine = content.split("\n")[0]
  if (firstLine.startsWith("#!")) return "code"
  const trimmed = content.trim()
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try { JSON.parse(trimmed); return "json" } catch {}
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try { JSON.parse(trimmed); return "json" } catch {}
  }
  if (trimmed.startsWith("<") && /<(!DOCTYPE\s+)?(html|xml)\b/i.test(trimmed)) return "code"
  if (/^---\s/.test(trimmed) || /^@@\s/.test(trimmed)) return "diff"
  if (/^(ERROR|WARN|FATAL|TRACE|DEBUG|INFO)\s/i.test(firstLine)) return "log"
  if (/^#\s+\w+/.test(trimmed)) return "markdown"
  if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s/i.test(trimmed)) return "sql"
  return "text"
}

export function detectLanguage(content: string, filename?: string): ArtifactLanguage | undefined {
  if (filename) {
    const ext = filename.split(".").pop()?.toLowerCase()
    if (ext && ext in EXT_TO_LANG) return EXT_TO_LANG[ext]
    const base = filename.split("/").pop()?.toLowerCase() ?? ""
    if (base === "dockerfile") return "docker"
  }
  const firstLine = content.split("\n")[0]
  if (firstLine.startsWith("#!")) {
    if (firstLine.includes("bash") || firstLine.includes("sh") || firstLine.includes("zsh")) return "bash"
    if (firstLine.includes("python")) return "python"
    if (firstLine.includes("node")) return "javascript"
    if (firstLine.includes("deno")) return "typescript"
  }
  const trimmed = content.trim()
  if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s/i.test(trimmed)) return "sql"
  if (trimmed.startsWith("package ") && trimmed.includes("import")) return "go"
  if (trimmed.startsWith("use ") && trimmed.includes("mod ") && trimmed.includes("fn ")) return "rust"
  if (trimmed.includes("from \"react\"") || trimmed.includes("from 'react'")) return "typescript"
  return undefined
}

export function estimateTokens(text: string, type?: ArtifactType, language?: ArtifactLanguage): number {
  const key = (language as string) ?? (type as string) ?? "text"
  const factor = TOKEN_FACTORS[key as keyof typeof TOKEN_FACTORS] ?? 3.5
  return Math.ceil(text.length / factor)
}

export function compactContent(content: string, maxLines?: number): { preview: string; truncated: boolean; remaining: number } {
  const lines = content.split("\n")
  const max = maxLines ?? 30
  if (lines.length <= max) return { preview: content, truncated: false, remaining: 0 }
  if (lines.length > 1000) {
    const head = lines.slice(0, 10).join("\n")
    const tail = lines.slice(-10).join("\n")
    const remaining = lines.length - 20
    const preview = head + `\n\n// ... (+${formatNumber(remaining)} more lines)\n\n` + tail
    return { preview, truncated: true, remaining }
  }
  const remaining = lines.length - 20
  const preview = lines.slice(0, 20).join("\n") + `\n\n// ... (+${formatNumber(remaining)} more lines)`
  return { preview, truncated: true, remaining }
}

function formatNumber(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")
}

function getDepth(value: unknown, current = 0): number {
  if (current > 10) return current
  if (Array.isArray(value)) return value.length > 0 ? getDepth(value[0], current + 1) : current + 1
  if (value !== null && typeof value === "object") {
    const depths = Object.values(value as Record<string, unknown>).map((v) => getDepth(v, current + 1))
    return Math.max(...depths, current + 1)
  }
  return current
}

function jsonPreview(content: string): { preview: string; truncated: boolean; remaining: number } {
  try {
    const parsed = JSON.parse(content)
    const pretty = JSON.stringify(parsed, null, 2)
    const depth = getDepth(parsed)
    let summary: string
    if (Array.isArray(parsed)) {
      const types = new Set(parsed.slice(0, 100).map((i) => Array.isArray(i) ? "array" : typeof i))
      summary = `// JSON array[${parsed.length}] items: ${[...types].join(", ")} depth: ${depth}\n`
    } else {
      const keys = Object.keys(parsed)
      summary = `// JSON object keys: ${keys.slice(0, 15).join(", ")}${keys.length > 15 ? "..." : ""} depth: ${depth}\n`
    }
    const result = compactContent(pretty, 30)
    return { preview: summary + result.preview, truncated: result.truncated, remaining: result.remaining }
  } catch {
    return compactContent(content, 30)
  }
}

function lastMatchingIndex(lines: string[], pattern: RegExp): number {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (pattern.test(lines[i])) return i
  }
  return -1
}

function logPreview(content: string, totalLines: number): { preview: string; truncated: boolean; remaining: number } {
  const allLines = content.trim().split("\n")
  const errorIdx = lastMatchingIndex(allLines, /error|fail|exception|traceback|stack/i)
  if (errorIdx >= 0) {
    const ctxStart = Math.max(0, errorIdx - 2)
    const ctxEnd = Math.min(allLines.length, errorIdx + 3)
    return {
      preview: allLines.slice(ctxStart, ctxEnd).join("\n"),
      truncated: totalLines > 30,
      remaining: Math.max(0, totalLines - (ctxEnd - ctxStart)),
    }
  }
  const show = allLines.slice(0, 5)
  return {
    preview: show.join("\n"),
    truncated: totalLines > 30,
    remaining: Math.max(0, totalLines - show.length),
  }
}

function diffPreview(content: string): { preview: string; truncated: boolean; remaining: number } {
  const lines = content.split("\n")
  const added = lines.filter((l) => l.startsWith("+") && !l.startsWith("+++")).length
  const removed = lines.filter((l) => l.startsWith("-") && !l.startsWith("---")).length
  const result = compactContent(content, 30)
  return {
    preview: `// Diff: +${added} -${removed} lines\n${result.preview}`,
    truncated: result.truncated,
    remaining: result.remaining,
  }
}

function csvPreview(content: string): { preview: string; truncated: boolean; remaining: number } {
  const rows = content.trim().split("\n")
  const cols = rows[0]?.split(",").length ?? 0
  const result = compactContent(content, 30)
  return {
    preview: `// CSV: ${rows.length} rows, ${cols} columns\n${result.preview}`,
    truncated: result.truncated,
    remaining: result.remaining,
  }
}

export function createArtifact(
  id: string,
  content: string,
  filename?: string,
  source?: string,
): ArtifactInfo {
  const type = detectArtifactType(content, filename)
  const language = type === "code" || type === "markdown" ? detectLanguage(content, filename) : undefined
  const lines = content.split("\n").length
  const tokens = estimateTokens(content, type, language)

  const compacted = type === "json" ? jsonPreview(content)
    : type === "log" ? logPreview(content, lines)
    : type === "diff" ? diffPreview(content)
    : type === "csv" ? csvPreview(content)
    : compactContent(content, 30)

  return {
    id, title: filename ?? id, type, language,
    size: content.length, lines, tokens,
    content, preview: compacted.preview, truncated: compacted.truncated,
    createdAt: Date.now(), source,
  }
}

export class ArtifactStore {
  private artifacts: Map<string, ArtifactInfo> = new Map()

  add(artifact: ArtifactInfo): void {
    this.artifacts.set(artifact.id, artifact)
  }

  get(id: string): ArtifactInfo | undefined {
    return this.artifacts.get(id)
  }

  list(): ArtifactInfo[] {
    return [...this.artifacts.values()]
  }

  remove(id: string): void {
    this.artifacts.delete(id)
  }

  clear(): void {
    this.artifacts.clear()
  }

  getBySource(messageId: string): ArtifactInfo[] {
    return this.list().filter((a) => a.source === messageId)
  }

  getTotalTokens(): number {
    return this.list().reduce((sum, a) => sum + a.tokens, 0)
  }

  getTotalSize(): number {
    return this.list().reduce((sum, a) => sum + a.size, 0)
  }
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B"
  const kb = bytes / 1024
  if (kb < 1024) return kb.toFixed(kb < 10 ? 1 : 0) + " KB"
  const mb = kb / 1024
  return mb.toFixed(mb < 10 ? 1 : 0) + " MB"
}

export function formatLines(n: number): string {
  return formatNumber(n) + " linhas"
}

export function formatTokens(n: number): string {
  return formatNumber(n) + " tokens"
}

export function getLanguageIcon(lang: ArtifactLanguage): string {
  return LANG_ICONS[lang]
}

export function getTypeIcon(type: ArtifactType): string {
  return TYPE_ICONS[type]
}
