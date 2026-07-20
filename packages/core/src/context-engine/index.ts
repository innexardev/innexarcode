/** Node types in the project dependency graph */
export const NODE_TYPES = [
  "project", "module", "dependency", "flow", "database", "api",
  "infrastructure", "test", "file", "configuration",
] as const
export type NodeType = (typeof NODE_TYPES)[number]

/** Edge types between graph nodes */
export const EDGE_TYPES = [
  "depends_on", "contains", "imports", "deploys_to", "calls", "implements",
] as const
export type EdgeType = (typeof EDGE_TYPES)[number]

/** A node in the project graph */
export interface GraphNode {
  id: string
  type: NodeType
  name: string
  path?: string
  description?: string
  metadata: Record<string, unknown>
  children: string[]
  dependencies: string[]
  dependents: string[]
}

/** A directed edge between two graph nodes */
export interface GraphEdge {
  source: string
  target: string
  type: EdgeType
  label?: string
}

/** A knowledge fact */
export interface Fact {
  id: string
  subject: string
  predicate: string
  object: string
  context?: string
  confidence?: number
  source?: string
  createdAt: number
}

/** A technology decision recorded in the knowledge base */
export interface TechnologyDecision {
  name: string
  version?: string
  category: string
  decision: string
  rationale?: string
  alternatives?: string[]
}

/** The knowledge base containing facts and technology decisions */
export interface KnowledgeBase {
  facts: Fact[]
  technologies: TechnologyDecision[]
}

/** The full project context graph */
export interface ContextGraph {
  nodes: Map<string, GraphNode>
  edges: GraphEdge[]
}

const CONFIG_FILES = new Set([
  "package.json", "tsconfig.json", "bun.lock", "bun.lockb",
  ".env", ".env.example", "docker-compose.yml", "Dockerfile",
  ".gitignore", ".editorconfig", "AGENTS.md", "CLAUDE.md", ".cursorrules",
])

const IGNORE_DIRS = new Set([
  "node_modules", ".git", ".opencode", "dist", "build", ".next",
  ".turbo", "coverage", ".vscode", ".idea", ".cache",
])

const NODE_TYPE_MAP: Record<string, NodeType> = {
  ".ts": "module",
  ".tsx": "module",
  ".js": "module",
  ".jsx": "module",
  ".mjs": "module",
  ".cjs": "module",
  ".json": "configuration",
  ".yaml": "configuration",
  ".yml": "configuration",
  ".toml": "configuration",
  ".env": "configuration",
  ".sql": "database",
  ".prisma": "database",
  ".graphql": "api",
  ".proto": "api",
  ".css": "file",
  ".scss": "file",
  ".html": "file",
  ".md": "file",
}

function classifyFile(filePath: string): NodeType {
  for (const [ext, type] of Object.entries(NODE_TYPE_MAP)) {
    if (filePath.endsWith(ext)) return type
  }
  return "file"
}

const IMPORT_RE = /(?:import\s+(?:(?:[\w*\s{,}]*)\s+from\s+)?["']([^"']+)["']|require\(["']([^"']+)["']\)|import\(["']([^"']+)["']\))/g

function extractImports(content: string): string[] {
  const imports: string[] = []
  let match: RegExpExecArray | null
  while ((match = IMPORT_RE.exec(content)) !== null) {
    const specifier = match[1] || match[2] || match[3]
    if (specifier && (specifier.startsWith("./") || specifier.startsWith("../"))) {
      imports.push(specifier)
    }
  }
  return imports
}

function resolveRelative(from: string, target: string): string {
  const dir = from.includes("/") ? from.substring(0, from.lastIndexOf("/") + 1) : ""
  const parts = (dir + target).split("/")
  const result: string[] = []
  for (const p of parts) {
    if (p === "." || p === "") continue
    if (p === "..") { result.pop(); continue }
    result.push(p)
  }
  return result.join("/")
}

function nodeId(path: string): string {
  return path.replace(/\\/g, "/")
}

function inferEdgeType(sourceType: NodeType, targetPath: string): EdgeType {
  if (targetPath.endsWith(".sql") || targetPath.endsWith(".prisma")) return "depends_on"
  if (targetPath.includes("api") || targetPath.includes("graphql")) return "calls"
  if (sourceType === "configuration") return "depends_on"
  return "imports"
}

/**
 * Scan a list of files and build a dependency graph.
 * Extracts import statements from source files.
 */
export async function buildDependencyGraph(files: string[]): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const seen = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []

  for (const file of files) {
    const id = nodeId(file)
    if (seen.has(id)) continue
    const name = file.split("/").pop() || file
    const type = CONFIG_FILES.has(name) ? "configuration" : classifyFile(file)
    seen.set(id, { id, type, name, path: file, metadata: {}, children: [], dependencies: [], dependents: [] })
  }

  for (const node of seen.values()) {
    if (!node.path || node.type === "file") continue
    try {
      const content = await Bun.file(node.path).text()
      for (const specifier of extractImports(content)) {
        const resolved = nodeId(resolveRelative(node.path, specifier))
        if (resolved === node.id) continue
        if (!node.dependencies.includes(resolved)) node.dependencies.push(resolved)
        const dep = seen.get(resolved)
        if (dep && !dep.dependents.includes(node.id)) dep.dependents.push(node.id)
        if (!edges.some((e) => e.source === node.id && e.target === resolved)) {
          edges.push({ source: node.id, target: resolved, type: inferEdgeType(node.type, specifier) })
        }
      }
    } catch {}
  }

  return { nodes: [...seen.values()], edges }
}

/** Classify a file path into a node type */
export function identifyNodeType(filePath: string): NodeType {
  const name = filePath.split("/").pop() || ""
  if (CONFIG_FILES.has(name)) return "configuration"
  return classifyFile(filePath)
}

// ── ContextEngine Service ──

function bfsShortestPath(graph: ContextGraph, from: string, to: string): string[] | null {
  const visited = new Set([from])
  const queue: { id: string; path: string[] }[] = [{ id: from, path: [from] }]
  while (queue.length > 0) {
    const { id, path } = queue.shift()!
    if (id === to) return path
    const node = graph.nodes.get(id)
    if (!node) continue
    for (const depId of node.dependencies) {
      if (!visited.has(depId)) { visited.add(depId); queue.push({ id: depId, path: [...path, depId] }) }
    }
  }
  return null
}

/**
 * Context Engine — builds and queries a project dependency graph.
 *
 * Usage:
 *   const engine = new ContextEngine()
 *   await engine.scanProject("/path/to/project")
 *   const impact = engine.impactAnalysis("src/auth/login.ts")
 */
export class ContextEngine {
  private graph: ContextGraph = { nodes: new Map(), edges: [] }
  private kb: KnowledgeBase = { facts: [], technologies: [] }

  /** Scan a project directory and build the full dependency graph */
  async scanProject(path: string): Promise<ContextGraph> {
    this.graph = { nodes: new Map(), edges: [] }
    this.kb = { facts: [], technologies: [] }

    // Root project node
    const projectId = nodeId(path)
    this.graph.nodes.set(projectId, {
      id: projectId, type: "project", name: path.split("/").pop() || path,
      path, metadata: {}, children: [], dependencies: [], dependents: [],
    })

    await this.scanDirectory(path, projectId)

    // Build edge list
    const seen = new Set<string>()
    for (const node of this.graph.nodes.values()) {
      for (const depId of node.dependencies) {
        const key = `${node.id}->${depId}`
        if (seen.has(key)) continue
        seen.add(key)
        const target = this.graph.nodes.get(depId)
        this.graph.edges.push({
          source: node.id, target: depId,
          type: target ? inferEdgeType(node.type, target.path || depId) : "depends_on",
        })
      }
    }

    // Extract dependencies from package.json
    try {
      const pkg = await Bun.file(path + "/package.json").json()
      const deps = { ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>
      for (const [name, version] of Object.entries(deps)) {
        this.kb.technologies.push({
          name, version: String(version), category: "dependency",
          decision: "used", rationale: `Declared in package.json`,
        })
      }
    } catch {}

    return this.graph
  }

  private async scanDirectory(dirPath: string, parentId: string): Promise<void> {
    try {
      for await (const entry of new Bun.Glob("**/*").scan({ cwd: dirPath, onlyFiles: false, absolute: true })) {
        const relPath = entry.replace(dirPath + "/", "")
        const parts = relPath.split("/")
        if (parts.some((p) => IGNORE_DIRS.has(p))) continue

        const id = nodeId(entry)
        if (this.graph.nodes.has(id)) continue

        const node: GraphNode = {
          id, type: identifyNodeType(entry), name: parts[parts.length - 1],
          path: entry, metadata: {}, children: [], dependencies: [], dependents: [],
        }
        this.graph.nodes.set(id, node)

        const parent = this.graph.nodes.get(parentId)
        if (parent && !parent.children.includes(id)) parent.children.push(id)

        // Extract imports from source files
        if (node.type === "module" || node.type === "api") {
          try {
            for (const specifier of extractImports(await Bun.file(entry).text())) {
              const resolved = nodeId(resolveRelative(entry, specifier))
              if (resolved === id) continue
              if (!node.dependencies.includes(resolved)) node.dependencies.push(resolved)
              const dep = this.graph.nodes.get(resolved)
              if (dep && !dep.dependents.includes(id)) dep.dependents.push(id)
            }
          } catch {}
        }
      }
    } catch {}
  }

  getNode(id: string): GraphNode | undefined {
    return this.graph.nodes.get(id)
  }

  queryDependencies(id: string): GraphNode[] {
    const node = this.graph.nodes.get(id)
    return node ? node.dependencies.map((d) => this.graph.nodes.get(d)).filter(Boolean) as GraphNode[] : []
  }

  queryDependents(id: string): GraphNode[] {
    const node = this.graph.nodes.get(id)
    return node ? node.dependents.map((d) => this.graph.nodes.get(d)).filter(Boolean) as GraphNode[] : []
  }

  findModule(name: string): GraphNode | undefined {
    for (const node of this.graph.nodes.values()) {
      if (node.name === name || node.id.endsWith("/" + name)) return node
    }
    return undefined
  }

  getGraph(): ContextGraph {
    return this.graph
  }

  getKnowledgeBase(): KnowledgeBase {
    return this.kb
  }

  /** Analyze what's affected if a node changes (traverses dependents) */
  impactAnalysis(id: string): { affected: GraphNode[]; paths: GraphEdge[][] } {
    const affected: GraphNode[] = []
    const paths: GraphEdge[][] = []
    const visited = new Set<string>()
    const queue: { id: string; path: GraphEdge[] }[] = [{ id, path: [] }]

    while (queue.length > 0) {
      const current = queue.shift()!
      if (visited.has(current.id)) continue
      visited.add(current.id)
      if (current.id !== id) {
        const node = this.graph.nodes.get(current.id)
        if (node) affected.push(node)
        if (current.path.length > 0) paths.push(current.path)
      }
      const node = this.graph.nodes.get(current.id)
      if (!node) continue
      for (const depId of node.dependents) {
        if (visited.has(depId)) continue
        const edge = this.graph.edges.find((e) => e.source === current.id && e.target === depId)
        queue.push({ id: depId, path: edge ? [...current.path, edge] : current.path })
      }
    }
    return { affected, paths }
  }

  getShortestPath(from: string, to: string): GraphNode[] | null {
    const ids = bfsShortestPath(this.graph, from, to)
    return ids ? ids.map((id) => this.graph.nodes.get(id)).filter(Boolean) as GraphNode[] : null
  }

  addTechnology(name: string, category: string, decision: string, version?: string, rationale?: string, alternatives?: string[]): void {
    this.kb.technologies.push({ name, version, category, decision, rationale, alternatives })
  }

  addFact(subject: string, predicate: string, object: string, context?: string, confidence?: number, source?: string): void {
    this.kb.facts.push({
      id: `${subject}:${predicate}:${object}:${Date.now()}`,
      subject, predicate, object, context, confidence, source, createdAt: Date.now(),
    })
  }

  searchFacts(query: string): Fact[] {
    const q = query.toLowerCase()
    return this.kb.facts.filter(
      (f) => f.subject.toLowerCase().includes(q) || f.predicate.toLowerCase().includes(q) ||
            f.object.toLowerCase().includes(q) || (f.context?.toLowerCase().includes(q)),
    )
  }

  addEdge(edge: GraphEdge): void {
    this.graph.edges.push(edge)
    const src = this.graph.nodes.get(edge.source)
    if (src && !src.dependencies.includes(edge.target)) src.dependencies.push(edge.target)
    const tgt = this.graph.nodes.get(edge.target)
    if (tgt && !tgt.dependents.includes(edge.source)) tgt.dependents.push(edge.source)
  }
}
