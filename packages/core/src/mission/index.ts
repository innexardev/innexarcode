export * as Mission from "./index"

export const MISSION_TYPES = [
  "create",
  "feature",
  "bugfix",
  "review",
  "refactor",
  "upgrade",
  "performance",
  "security",
  "database",
  "deploy",
  "testing",
  "docs",
  "devops",
  "api",
  "frontend",
  "backend",
] as const

export type MissionType = (typeof MISSION_TYPES)[number]

export interface PipelineStep {
  phase: string
  agent: string
  description: string
  gates?: string[]
}

export interface PipelineDefinition {
  type: MissionType
  label: string
  description: string
  steps: PipelineStep[]
  triggers: string[]
  priority: number
}

export interface MissionMatch {
  type: MissionType
  confidence: number
  pipeline: PipelineDefinition
}

function s(phase: string, agent: string, description: string, gates?: string[]): PipelineStep {
  return gates ? { phase, agent, description, gates } : { phase, agent, description }
}

const PIPELINES: PipelineDefinition[] = [
  {
    type: "create",
    label: "Full Development",
    description: "Criar novo projeto/sistema do zero",
    priority: 1,
    triggers: ["criar", "novo projeto", "construir", "desenvolver", "gerar", "scaffold", "iniciar projeto", "montar", "fazer sistema", "criar app", "criar api", "criar saas"],
    steps: [
      s("discovery", "explore", "Explorar requisitos e contexto do projeto"),
      s("research", "general", "Pesquisar tecnologias e abordagens"),
      s("planning", "planner", "Criar plano de implementação"),
      s("architecture", "architect", "Definir arquitetura do sistema"),
      s("debate", "general", "Revisão cross-funcional da proposta"),
      s("implementation", "general", "Implementar o código"),
      s("review", "code-reviewer", "Revisar código implementado", ["lint", "types"]),
      s("qa", "qa", "Executar testes e validar qualidade", ["build", "types", "tests"]),
      s("security", "security", "Auditar segurança", ["build", "tests"]),
      s("self-critique", "auditor", "Autocrítica do código produzido"),
      s("question", "questionador", "Questionar o que pode estar faltando"),
      s("audit", "auditor", "Auditoria completa"),
      s("delivery", "release-manager", "Preparar entrega", ["build", "lint", "types", "tests", "security"]),
    ],
  },
  {
    type: "feature",
    label: "Feature",
    description: "Adicionar nova funcionalidade",
    priority: 7,
    triggers: ["adicionar", "nova funcionalidade", "feature", "implementar", "criar módulo", "adicionar tela", "novo recurso", "enhancement", "adicionar rota"],
    steps: [
      s("discovery", "explore", "Analisar requisitos da feature"),
      s("research", "general", "Pesquisar abordagens"),
      s("planning", "planner", "Planejar implementação"),
      s("architecture", "architect", "Definir arquitetura"),
      s("implementation", "general", "Implementar funcionalidade"),
      s("review", "code-reviewer", "Revisar código", ["lint", "types"]),
      s("qa", "qa", "Testar funcionalidade", ["build", "types", "tests"]),
      s("delivery", "release-manager", "Entregar feature"),
    ],
  },
  {
    type: "bugfix",
    label: "Bug Fix",
    description: "Corrigir bug ou erro no sistema",
    priority: 8,
    triggers: ["bug", "erro", "falha", "crash", "quebrado", "não funciona", "broken", "exception", "stacktrace", "erro ao", "não está", "parou", "problema", "issue", "fix", "corrigir", "arrumar", "reparar"],
    steps: [
      s("reproduce", "general", "Reproduzir o bug"),
      s("analyze", "general", "Analisar causa raiz"),
      s("research", "general", "Pesquisar soluções conhecidas"),
      s("plan", "planner", "Planejar a correção"),
      s("fix", "general", "Implementar a correção"),
      s("test", "qa", "Verificar se o bug foi corrigido"),
      s("review", "code-reviewer", "Revisar a correção"),
      s("qa", "qa", "Testes de regressão"),
      s("delivery", "release-manager", "Entregar correção"),
    ],
  },
  {
    type: "review",
    label: "Code Review",
    description: "Revisar código ou projeto existente",
    priority: 4,
    triggers: ["revisar", "review", "code review", "analisar código", "avaliar", "inspecionar", "auditoria", "check up", "análise técnica"],
    steps: [
      s("read-project", "explore", "Ler e entender o projeto"),
      s("analyze-architecture", "architect", "Analisar arquitetura"),
      s("backend-review", "code-reviewer", "Revisar código backend"),
      s("frontend-review", "ux-reviewer", "Revisar frontend/UX"),
      s("database-review", "general", "Revisar modelo de dados"),
      s("security-review", "security", "Revisar segurança"),
      s("performance-review", "performance", "Revisar performance"),
      s("report", "documentation", "Gerar relatório de revisão"),
    ],
  },
  {
    type: "refactor",
    label: "Refactor",
    description: "Refatorar código existente",
    priority: 5,
    triggers: ["refatorar", "refactor", "melhorar código", "código duplicado", "dead code", "complexidade", "simplificar", "tech debt", "dívida técnica", "clean code"],
    steps: [
      s("discovery", "explore", "Mapear código existente"),
      s("map-dependencies", "cto", "Mapear dependências"),
      s("detect-smells", "refactor", "Detectar code smells"),
      s("plan", "planner", "Planejar refatoração"),
      s("evaluate-risks", "architect", "Avaliar riscos"),
      s("execute", "refactor", "Executar refatoração"),
      s("benchmark", "performance", "Benchmarkar performance"),
      s("tests", "qa", "Executar testes"),
      s("review", "code-reviewer", "Revisar mudanças"),
      s("qa", "qa", "Validação de qualidade"),
      s("delivery", "release-manager", "Entregar refatoração"),
    ],
  },
  {
    type: "upgrade",
    label: "Upgrade",
    description: "Atualizar dependências e versões",
    priority: 4,
    triggers: ["atualizar", "upgrade", "update", "versão", "breaking changes", "migrar versão", "bump", "atualizar dependência", "nova versão"],
    steps: [
      s("check-current", "general", "Verificar versões atuais"),
      s("research-changelog", "general", "Pesquisar changelogs"),
      s("research-breaking-changes", "general", "Pesquisar breaking changes"),
      s("plan", "planner", "Planejar upgrade"),
      s("backup", "general", "Fazer backup"),
      s("upgrade", "general", "Executar upgrade"),
      s("build", "general", "Verificar build", ["lint"]),
      s("tests", "qa", "Executar testes"),
      s("benchmark", "performance", "Benchmarkar performance"),
      s("review", "code-reviewer", "Revisar mudanças"),
      s("delivery", "release-manager", "Entregar upgrade"),
    ],
  },
  {
    type: "performance",
    label: "Performance",
    description: "Otimizar performance do sistema",
    priority: 5,
    triggers: ["performance", "lento", "slow", "otimizar", "melhorar velocidade", "bundle", "carregamento", "cache", "latency", "throughput", "bottleneck"],
    steps: [
      s("collect-metrics", "performance", "Coletar métricas atuais"),
      s("analyze-cpu", "performance", "Analisar uso de CPU"),
      s("analyze-ram", "performance", "Analisar uso de memória"),
      s("analyze-db", "database", "Analisar performance de banco"),
      s("analyze-frontend", "ux-reviewer", "Analisar performance frontend"),
      s("analyze-bundle", "performance", "Analisar bundle size"),
      s("plan", "planner", "Planejar otimizações"),
      s("apply", "general", "Aplicar otimizações"),
      s("benchmark", "performance", "Benchmarkar resultados"),
      s("report", "documentation", "Gerar relatório"),
    ],
  },
  {
    type: "security",
    label: "Security Audit",
    description: "Auditoria completa de segurança",
    priority: 10,
    triggers: ["segurança", "security", "vulnerabilidade", "owasp", "invasão", "proteger", "auth", "jwt", "cors", "sql injection", "xss", "csrf", "rate limit", "rbac"],
    steps: [
      s("owasp-scan", "security", "Escaneamento OWASP Top 10"),
      s("check-dependencies", "security", "Verificar dependências vulneráveis", ["build"]),
      s("check-secrets", "security", "Verificar secrets expostos"),
      s("check-jwt", "security", "Verificar autenticação JWT"),
      s("check-cors", "security", "Verificar configuração CORS"),
      s("check-headers", "security", "Verificar security headers"),
      s("check-injection", "security", "Verificar SQL injection"),
      s("check-xss", "security", "Verificar XSS"),
      s("check-csrf", "security", "Verificar CSRF"),
      s("check-rate-limit", "security", "Verificar rate limiting"),
      s("check-rbac", "security", "Verificar RBAC"),
      s("report", "documentation", "Gerar relatório de segurança"),
      s("fixes", "general", "Aplicar correções"),
      s("review", "code-reviewer", "Revisar correções"),
    ],
  },
  {
    type: "database",
    label: "Database",
    description: "Migração, modelagem ou otimização de banco de dados",
    priority: 6,
    triggers: ["banco", "database", "migration", "schema", "sql", "query", "índice", "model", "prisma", "drizzle", "tabela", "foreign key", "seed"],
    steps: [
      s("analyze-schema", "general", "Analisar schema atual"),
      s("design-model", "architect", "Projetar modelo de dados"),
      s("plan", "planner", "Planejar migração/modelagem"),
      s("create-migration", "general", "Criar migrações"),
      s("optimize-queries", "database", "Otimizar consultas"),
      s("add-indexes", "database", "Adicionar índices"),
      s("seed-data", "general", "Criar seeds"),
      s("test", "qa", "Testar migração/queries"),
      s("review", "code-reviewer", "Revisar mudanças no banco"),
      s("delivery", "release-manager", "Entregar alterações no banco"),
    ],
  },
  {
    type: "deploy",
    label: "Deploy",
    description: "Preparar e executar deploy para produção",
    priority: 9,
    triggers: ["deploy", "produção", "release", "publicar", "homologação", "staging", "rollback", "ci/cd", "pipeline deploy"],
    steps: [
      s("check-build", "general", "Verificar build", ["build"]),
      s("check-tests", "qa", "Verificar testes", ["tests"]),
      s("check-security", "security", "Verificar segurança"),
      s("check-docker", "general", "Verificar Docker"),
      s("check-ci", "general", "Verificar CI pipeline"),
      s("prepare", "release-manager", "Preparar release"),
      s("verify", "qa", "Verificar ambiente"),
      s("monitoring", "general", "Configurar monitoramento"),
      s("release", "release-manager", "Executar release"),
    ],
  },
  {
    type: "testing",
    label: "Testing",
    description: "Criar ou melhorar testes do sistema",
    priority: 5,
    triggers: ["teste", "test", "cobertura", "coverage", "spec", "e2e", "integration test", "unit test", "jest", "vitest", "playwright"],
    steps: [
      s("analyze-coverage", "qa", "Analisar cobertura atual"),
      s("identify-gaps", "qa", "Identificar gaps de cobertura"),
      s("plan", "planner", "Planejar testes"),
      s("create-tests", "general", "Criar testes"),
      s("run-tests", "qa", "Executar testes"),
      s("review", "code-reviewer", "Revisar testes"),
      s("update-ci", "general", "Atualizar CI se necessário"),
    ],
  },
  {
    type: "docs",
    label: "Documentation",
    description: "Criar ou atualizar documentação",
    priority: 2,
    triggers: ["documentação", "documentation", "readme", "swagger", "api doc", "changelog", "adr", "wiki", "manual"],
    steps: [
      s("read-project", "explore", "Ler o projeto"),
      s("find-apis", "general", "Encontrar APIs"),
      s("find-components", "general", "Encontrar componentes"),
      s("find-models", "general", "Encontrar modelos de dados"),
      s("generate-readme", "documentation", "Gerar README"),
      s("generate-api-docs", "documentation", "Gerar documentação de API"),
      s("generate-diagrams", "documentation", "Gerar diagramas"),
      s("generate-adr", "documentation", "Gerar ADRs"),
      s("update-changelog", "documentation", "Atualizar changelog"),
    ],
  },
  {
    type: "devops",
    label: "DevOps",
    description: "Configurar CI/CD e infraestrutura",
    priority: 6,
    triggers: ["docker", "compose", "ci", "cd", "github actions", "workflow", "infra", "servidor", "nginx", "cloud", "kubernetes"],
    steps: [
      s("discovery", "explore", "Analisar setup atual"),
      s("plan", "planner", "Planejar setup DevOps"),
      s("configure-docker", "general", "Configurar Docker"),
      s("configure-ci", "general", "Configurar CI"),
      s("configure-cd", "general", "Configurar CD"),
      s("configure-infra", "general", "Configurar infraestrutura"),
      s("test-pipeline", "qa", "Testar pipeline completa"),
      s("document", "documentation", "Documentar setup"),
    ],
  },
  {
    type: "api",
    label: "API",
    description: "Criar ou modificar APIs",
    priority: 6,
    triggers: ["api", "endpoint", "rota", "graphql", "rest", "webhook", "integração", "serviço externo"],
    steps: [
      s("discovery", "explore", "Analisar requisitos da API"),
      s("design", "architect", "Projetar API"),
      s("plan", "planner", "Planejar implementação"),
      s("implement", "general", "Implementar endpoints"),
      s("document", "documentation", "Documentar API"),
      s("test", "qa", "Testar API"),
      s("review", "code-reviewer", "Revisar implementação"),
      s("qa", "qa", "Validação de qualidade"),
      s("delivery", "release-manager", "Entregar API"),
    ],
  },
  {
    type: "frontend",
    label: "Frontend",
    description: "Trabalho de frontend/UI",
    priority: 5,
    triggers: ["frontend", "ui", "componente", "tela", "layout", "css", "tailwind", "react", "vue", "angular", "responsive", "design"],
    steps: [
      s("discovery", "explore", "Analisar requisitos de UI"),
      s("design", "ux-reviewer", "Projetar interface"),
      s("plan", "planner", "Planejar implementação"),
      s("implement", "general", "Implementar componentes"),
      s("test", "qa", "Testar frontend"),
      s("review", "ux-reviewer", "Revisar UX/UI"),
      s("qa", "qa", "Validação de qualidade"),
      s("delivery", "release-manager", "Entregar frontend"),
    ],
  },
  {
    type: "backend",
    label: "Backend",
    description: "Trabalho de backend/server",
    priority: 5,
    triggers: ["backend", "server", "api rest", "service", "controller", "middleware", "autenticação", "autorização"],
    steps: [
      s("discovery", "explore", "Analisar requisitos backend"),
      s("design", "architect", "Projetar arquitetura backend"),
      s("plan", "planner", "Planejar implementação"),
      s("implement", "general", "Implementar backend"),
      s("test", "qa", "Testar backend"),
      s("review", "code-reviewer", "Revisar código backend"),
      s("qa", "qa", "Validação de qualidade"),
      s("delivery", "release-manager", "Entregar backend"),
    ],
  },
]

const KEYWORDS: Record<MissionType, string[]> = {
  create: ["criar", "novo projeto", "construir", "desenvolver", "gerar", "scaffold", "iniciar projeto", "montar", "fazer sistema", "criar app", "criar api", "criar saas"],
  feature: ["adicionar", "nova funcionalidade", "feature", "implementar", "criar módulo", "adicionar tela", "novo recurso", "enhancement", "adicionar rota"],
  bugfix: ["bug", "erro", "falha", "crash", "quebrado", "não funciona", "broken", "exception", "stacktrace", "erro ao", "não está", "parou", "problema", "issue", "fix", "corrigir", "arrumar", "reparar"],
  review: ["revisar", "review", "code review", "analisar código", "avaliar", "inspecionar", "auditoria", "check up", "análise técnica"],
  refactor: ["refatorar", "refactor", "melhorar código", "código duplicado", "dead code", "complexidade", "simplificar", "tech debt", "dívida técnica", "clean code"],
  upgrade: ["atualizar", "upgrade", "update", "versão", "breaking changes", "migrar versão", "bump", "atualizar dependência", "nova versão"],
  performance: ["performance", "lento", "slow", "otimizar", "melhorar velocidade", "bundle", "carregamento", "cache", "latency", "throughput", "bottleneck"],
  security: ["segurança", "security", "vulnerabilidade", "owasp", "invasão", "proteger", "auth", "jwt", "cors", "sql injection", "xss", "csrf", "rate limit", "rbac"],
  database: ["banco", "database", "migration", "schema", "sql", "query", "índice", "model", "prisma", "drizzle", "tabela", "foreign key", "seed"],
  deploy: ["deploy", "produção", "release", "publicar", "homologação", "staging", "rollback", "ci/cd", "pipeline deploy"],
  testing: ["teste", "test", "cobertura", "coverage", "spec", "e2e", "integration test", "unit test", "jest", "vitest", "playwright"],
  docs: ["documentação", "documentation", "readme", "swagger", "api doc", "changelog", "adr", "wiki", "manual"],
  devops: ["docker", "compose", "ci", "cd", "github actions", "workflow", "infra", "servidor", "nginx", "cloud", "kubernetes"],
  api: ["api", "endpoint", "rota", "graphql", "rest", "webhook", "integração", "serviço externo"],
  frontend: ["frontend", "ui", "componente", "tela", "layout", "css", "tailwind", "react", "vue", "angular", "responsive", "design"],
  backend: ["backend", "server", "api rest", "service", "controller", "middleware", "autenticação", "autorização"],
}

const TEXT_PIPELINES = PIPELINES.map((p) => ({ ...p }))

export class MissionEngine {
  private pipelines: PipelineDefinition[]

  constructor() {
    this.pipelines = TEXT_PIPELINES.map((p) => ({ ...p }))
  }

  private findPipeline(type: MissionType): PipelineDefinition {
    const pipeline = this.pipelines.find((p) => p.type === type)
    if (!pipeline) throw new Error(`Pipeline not found for mission type: ${type}`)
    return pipeline
  }

  detect(text: string): MissionMatch | null {
    const lower = text.toLowerCase()
    let best: MissionMatch | null = null

    for (const pipeline of this.pipelines) {
      const keywords = KEYWORDS[pipeline.type]
      const matches = keywords.filter((kw) => lower.includes(kw)).length
      if (matches === 0) continue

      let confidence = matches / keywords.length
      confidence = Math.min(confidence * (1 + pipeline.priority / 10 * 0.5), 0.99)

      if (!best || confidence > best.confidence) {
        best = { type: pipeline.type, confidence, pipeline }
      }
    }

    return best
  }

  getPipeline(type: MissionType): PipelineDefinition {
    return { ...this.findPipeline(type) }
  }

  listPipelines(): PipelineDefinition[] {
    return this.pipelines.map((p) => ({ ...p }))
  }

  composeWorkflow(types: MissionType[]): PipelineDefinition {
    if (types.length === 0) throw new Error("At least one mission type is required")

    const selected = types.map((t) => this.findPipeline(t))
    const primary = selected[0]

    return {
      type: primary.type,
      label: `Composed: ${selected.map((s) => s.label).join(" + ")}`,
      description: `Workflow composto por: ${selected.map((s) => s.description).join(", ")}`,
      triggers: [...primary.triggers],
      priority: primary.priority,
      steps: selected.flatMap((s) => s.steps),
    }
  }

  detectMulti(text: string): MissionMatch[] {
    const lower = text.toLowerCase()
    const matches: MissionMatch[] = []

    for (const pipeline of this.pipelines) {
      const keywords = KEYWORDS[pipeline.type]
      const matchedKeywords = keywords.filter((kw) => lower.includes(kw))
      if (matchedKeywords.length === 0) continue

      let confidence = matchedKeywords.length / keywords.length
      confidence = Math.min(confidence * (1 + pipeline.priority / 10 * 0.5), 0.99)

      matches.push({ type: pipeline.type, confidence, pipeline })
    }

    return matches.sort((a, b) => b.confidence - a.confidence)
  }
}
