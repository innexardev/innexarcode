export * as Dispatcher from "./dispatcher"

/**
 * Specialist Dispatcher — roteia o especialista certo para cada fase,
 * baseado no tipo de arquivo tocado, no template do projeto e nas
 * palavras-chave do goal. Seção 11.3 do docs/melhorias-nivel-senior.md.
 *
 * Sem isso, "especialistas" são só prompts diferentes chamados manualmente.
 * O valor real está no roteamento automático.
 */

export interface Specialist {
  id: string
  name: string
  focus: string
  /** extensões / caminhos que ativam este especialista */
  filePatterns: RegExp[]
  /** palavras-chave do goal que ativam este especialista */
  keywords: string[]
  /** templates de projeto onde é padrão */
  templates: string[]
  /** agente do pipeline (KNOWN_AGENTS) que executa a fase */
  agent: string
}

export const SPECIALISTS: Specialist[] = [
  {
    id: "frontend",
    name: "Frontend Specialist",
    focus: "React/Vue/Next, acessibilidade, responsividade, estados de UI",
    filePatterns: [/\.(tsx|jsx|vue|svelte)$/, /(^|\/)components?\//, /(^|\/)app\//, /(^|\/)pages?\//],
    keywords: ["ui", "tela", "componente", "frontend", "interface", "css", "responsive", "layout"],
    templates: ["web", "mobile"],
    agent: "design-critic",
  },
  {
    id: "backend",
    name: "Backend/API Specialist",
    focus: "Contratos REST/GraphQL, idempotência, tratamento de erro, validação",
    filePatterns: [/\.(route|api|controller|service|repository)\.[jt]s$/, /(^|\/)api\//, /(^|\/)routes?\//, /(^|\/)controllers?\//, /\.graphql$/],
    keywords: ["api", "endpoint", "rest", "graphql", "idempoten", "backend", "servidor", "http"],
    templates: ["api", "web", "infra"],
    agent: "code-reviewer",
  },
  {
    id: "database",
    name: "Database Specialist",
    focus: "Schema, migrations seguras, índices, N+1",
    filePatterns: [/\.sql\.ts$/, /\.sql$/, /(^|\/)migrations?\//, /(^|\/)schema\//, /drizzle|prisma|knex|sequelize/],
    keywords: ["migration", "schema", "índice", "index", "banco", "database", "sql", "query", "n+1"],
    templates: ["api", "data", "web"],
    agent: "refactor",
  },
  {
    id: "infra",
    name: "DevOps/Infra Specialist",
    focus: "IaC, custo de nuvem, deploy, escalabilidade",
    filePatterns: [/\.(tf|tfvars|hcl|yaml|yml)$/, /(^|\/)docker/, /Dockerfile/, /(^|\/)\.github\//, /(^|\/)k8s\//, /(^|\/)terraform\//],
    keywords: ["deploy", "docker", "kubernetes", "terraform", "aws", "azure", "gcp", "infra", "ci", "cd"],
    templates: ["infra", "api"],
    agent: "cto",
  },
  {
    id: "security",
    name: "Security Specialist",
    focus: "Authz, input validation, secrets, vetor de ataque real",
    filePatterns: [/auth\.ts$/, /(^|\/)auth\//, /(^|\/)middleware/, /(^|\/)permissions?\//, /\.env/],
    keywords: ["auth", "login", "token", "jwt", "senha", "password", "secret", "injection", "owasp", "cors"],
    templates: ["api", "web", "mobile", "infra"],
    agent: "security",
  },
  {
    id: "mobile",
    name: "Mobile Specialist",
    focus: "Store guidelines, performance de app, offline",
    filePatterns: [/\.(swift|kt)$/, /(^|\/)android\//, /(^|\/)ios\//, /expo|react-native/],
    keywords: ["app store", "play store", "offline", "mobile", "push", "notificação"],
    templates: ["mobile"],
    agent: "ux-reviewer",
  },
  {
    id: "data",
    name: "Data/ML Specialist",
    focus: "Pipelines de dados, validação de schema, data quality",
    filePatterns: [/\.(py|ipynb)$/, /(^|\/)etl\//, /(^|\/)pipelines?\//, /dbt\//, /\.parquet$/],
    keywords: ["etl", "pipeline", "dados", "data", "ml", "modelo", "analytics", "spark"],
    templates: ["data"],
    agent: "general",
  },
  {
    id: "qa-test",
    name: "QA/Test Specialist",
    focus: "O que testar (estratégia), não só rodar a suite",
    filePatterns: [/\.test\.ts$/, /\.spec\.ts$/, /(^|\/)tests?\//, /(^|\/)__tests__\//, /playwright|cypress|vitest|jest/],
    keywords: ["teste", "test", "cobertura", "regressão", "e2e", "unit"],
    templates: ["web", "api", "mobile", "data"],
    agent: "qa",
  },
  {
    id: "design-system",
    name: "Design System Specialist",
    focus: "Tokens/componentes reais do design system, nada de Tailwind default genérico",
    filePatterns: [/\.(tsx|jsx)$/, /(^|\/)tokens/, /(^|\/)theme/, /design-system|storybook|tailwind\.config/],
    keywords: ["token", "design system", "estilo", "theme", "cor", "componente visual"],
    templates: ["web", "mobile"],
    agent: "design-critic",
  },
  {
    id: "ux-writing",
    name: "UX Writing Specialist",
    focus: "Texto voltado ao usuário: erros, onboarding, copy — o que mais denuncia produto amador",
    filePatterns: [/\.(md|tsx|jsx)$/],
    keywords: ["copy", "texto", "mensagem", "onboarding", "tooltip", "erro de usuário", "empty state", "label"],
    templates: ["web", "mobile", "product"],
    agent: "ux-reviewer",
  },
  {
    id: "support",
    name: "Customer Support Specialist",
    focus: "Simula usuário real tentando usar a feature, reporta confusão",
    filePatterns: [],
    keywords: ["fluxo", "usuario", "user flow", "confusão", "usabilidade", "walkthrough"],
    templates: ["web", "mobile", "product"],
    agent: "questionador",
  },
]

/** Fases do pipeline onde especialistas têm papel definido */
export const PHASE_SPECIALIST_MAP: Record<string, string> = {
  architecture: "architect",
  debate: "cto",
  implementation: "general",
  review: "code-reviewer",
  qa: "qa",
  security: "security",
  "self-critique": "auditor",
  question: "questionador",
  audit: "auditor",
  delivery: "release-manager",
}

export interface RouteResult {
  /** especialistas ativados pelos arquivos do diff */
  byFiles: Specialist[]
  /** especialistas ativados pelas keywords do goal */
  byKeywords: Specialist[]
  /** especialistas padrão do template */
  byTemplate: Specialist[]
  /** recomendação final: especialistas únicos ordenados por relevância */
  recommended: Specialist[]
  /** partições de arquivos independentes por diretório de topo (13.2) */
  partitions: Record<string, string[]>
  /** agente recomendado por fase do pipeline */
  phaseAgents: Record<string, string>
}

export interface RouteInput {
  files?: string[]
  template?: string
  goal?: string
}

export function route(input: RouteInput): RouteResult {
  const files = input.files ?? []
  const goal = input.goal ?? ""
  const template = input.template ?? ""

  const byFiles = SPECIALISTS.filter((s) => files.some((f) => s.filePatterns.some((re) => re.test(f))))
  const byKeywords = SPECIALISTS.filter((s) => s.keywords.some((k) => goal.toLowerCase().includes(k.toLowerCase())))
  const byTemplate = SPECIALISTS.filter((s) => s.templates.includes(template))

  const score = new Map<string, number>()
  for (const s of byFiles) score.set(s.id, (score.get(s.id) ?? 0) + 3)
  for (const s of byKeywords) score.set(s.id, (score.get(s.id) ?? 0) + 2)
  for (const s of byTemplate) score.set(s.id, (score.get(s.id) ?? 0) + 1)

  const recommended = [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => SPECIALISTS.find((s) => s.id === id)!)
    .filter(Boolean)

  // Partições independentes por diretório de topo (para paralelismo seguro)
  const partitions: Record<string, string[]> = {}
  for (const f of files) {
    const top = f.split("/")[0] ?? "root"
    if (!partitions[top]) partitions[top] = []
    partitions[top].push(f)
  }

  const phaseAgents: Record<string, string> = { ...PHASE_SPECIALIST_MAP }
  // o especialista mais relevante assume o papel de implementation
  if (recommended.length > 0) {
    phaseAgents.implementation = recommended[0].agent
  }

  return { byFiles, byKeywords, byTemplate, recommended, partitions, phaseAgents }
}

/** Mostra o roteamento em formato legível para o tool */
export function formatRoute(result: RouteResult, files: string[]): string {
  const lines: string[] = []
  if (files.length > 0) lines.push(`Files (${files.length}): ${files.join(", ")}`)
  if (result.byFiles.length > 0) lines.push(`By file type: ${result.byFiles.map((s) => s.name).join(", ")}`)
  if (result.byKeywords.length > 0) lines.push(`By goal keywords: ${result.byKeywords.map((s) => s.name).join(", ")}`)
  if (result.byTemplate.length > 0) lines.push(`By template (${result.byTemplate.length} specialists): ${result.byTemplate.map((s) => s.name).join(", ")}`)
  lines.push(`Recommended: ${result.recommended.length > 0 ? result.recommended.map((s) => s.name).join(" → ") : "(none — generic agent)"}`)
  const parts = Object.entries(result.partitions).filter(([, v]) => v.length > 0)
  if (parts.length > 1) {
    lines.push(`Independent partitions (${parts.length} — safe parallelism):`)
    for (const [dir, fs] of parts) lines.push(`  ${dir}/ (${fs.length} files)`)
  } else {
    lines.push("Partitions: 1 (no parallel split possible)")
  }
  return lines.join("\n")
}