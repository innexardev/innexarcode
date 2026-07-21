/**
 * Auto Agent Switch — analisa a mensagem do usuário e decide:
 * 1. Qual agente usar
 * 2. Se precisa executar o pipeline automaticamente
 */

type IntentGroup = { patterns: RegExp[]; agent: string; priority: number }

const INTENT_MAP: IntentGroup[] = [
  // ── Full pipeline tasks → auto:pipeline → executa 13 fases ──
  { patterns: [
    // Criar/construir projetos
    /cri[ra].*projet/i, /nov[oa].*projet/i, /implement.*sistem/i,
    /cri[ra].*sistem/i, /constru[ií]r/i, /desenvolve.*projet/i,
    /cri[ra].*aplicativ/i, /cri[ra].*app\b/i, /cri[ra].*api\b/i,
    /cri[ra].*serviç/i, /cri[ra].*m[óo]dul/i, /cri[ra].*funcionalidad/i,
    /fazer.*projet/i, /cri[ra].*do.?zero/i, /projet.*novo/i,
    /iniciar.*projet/i, /começ[ra].*projet/i, /montar.*projet/i,
    /gerar.*projet/i, /scaffold/i, /boilerplate/i,
    /cri[ra].*startup/i, /cri[ra].*saas/i, /cri[ra].*plataform/i,
    // Revisar/auditar projetos
    /review.*projet/i, /revis[ãa]o.*projet/i, /auditar.*projet/i,
    /analisa.*projet/i, /analis.*complet/i,
    /revis[ãa]o.*complet/i, /audit.*complet/i,
    /check.?up.*projet/i, /diagnostic.*projet/i,
    // Implementar features
    /implement.*feature/i, /cri[ra].*feature/i, /nova.*feature/i,
    /adicionar.*funcionalidad/i, /adicionar.*m[óo]dul/i,
    /adicionar.*api\b/i, /adicionar.*rota/i, /adicionar.*endpoint/i,
    /adicionar.*compon/i, /adicionar.*tela/i, /adicionar.*p[áa]gin/i,
    // Integrações
    /integr[ra].*api/i, /integr[ra].*serviç/i, /conect[ra].*api/i,
    /conect[ra].*banco/i, /integr[ra].*banco/i,
    /cri[ra].*webhook/i, /cri[ra].*integration/i,
    // Setup/configuração
    /configur[ra].*projet/i, /setup.*projet/i, /inicializ[ra].*projet/i,
    /configur[ra].*api/i, /configur[ra].*banco/i,
    /configur[ra].*docker/i, /configur[ra].*ci/i,
    // Full review/audit
    /revis[ãa]o.*geral/i, /audit.*geral/i, /revis[ãa]o.*técnic/i,
    /an[áa]lise.*complet/i, /levantament.*requisit/i,
    // Deploy/release
    /prepar[ra].*deploy/i, /prepar[ra].*release/i,
    /configur[ra].*deploy/i, /cri[ra].*pipeline.*ci/i,
    /cri[ra].*workflow/i, /automatiz[ra].*deploy/i,
  ], agent: "auto:pipeline", priority: 5 },

  // ── QA / Testes ──
  { patterns: [
    /test(?:e|ar|es)?\b/i, /\bqa\b/i, /qualidade/i, /cobertur/i, /coverage/i,
    /\bbug\b/i, /falha/i, /quebr/i, /assert/i,
    /teste.?unit[áa]ri/i, /teste.?integration/i, /e2e\b/i, /test case/i,
  ], agent: "qa", priority: 3 },
  { patterns: [
    /tenta.?quebr/i, /break.?test/i, /adversari/i, /hackeia/i, /exploit/i,
  ], agent: "qa-breaker", priority: 2 },

  // ── Segurança ──
  { patterns: [
    /seguranç/i, /\bsecurity\b/i, /\bowasp\b/i, /vulnerabil/i,
    /\bcve\b/i, /injection/i, /\bxss\b/i, /\bcsrf\b/i,
    /sql.?injection/i, /autentica[çc][ãa]o/i, /permiss[ãa]o/i,
    /rbac\b/i, /cors\b/i,
  ], agent: "security", priority: 3 },
  { patterns: [
    /audit/i, /auditori/i, /revis[ãa]o.?final/i, /conformidad/i,
  ], agent: "auditor", priority: 2 },

  // ── Arquitetura ──
  { patterns: [
    /arquitetur/i, /\barchitecture\b/i, /estrutur/i, /m[óo]dulo/i,
    /design.?pattern/i, /\bsolid\b/i, /clean.?arch/i, /camada/i,
    /separação/i, /dependenc/i, /invers[ãa]o/i,
  ], agent: "architect", priority: 3 },
  { patterns: [
    /impacto/i, /impact.?analysis/i, /dependência/i, /grafo/i,
  ], agent: "cto", priority: 2 },

  // ── Planejamento ──
  { patterns: [
    /plano\b/i, /\bplan\b/i, /planejament/i, /roadmap/i, /\bsprint\b/i,
    /tarefa/i, /\btask\b/i, /\btodo\b/i, /prioridad/i,
    /cronograma/i, /hist[óo]ria/i, /user.?story/i,
  ], agent: "planner", priority: 3 },

  // ── Review ──
  { patterns: [
    /review\b/i, /revisar/i, /code.?review/i, /\bpr\b/i,
    /pull.?request/i, /aprov/i, /merge/i,
  ], agent: "code-reviewer", priority: 3 },
  { patterns: [/\bux\b/i, /usabilidad/i, /interface/i], agent: "ux-reviewer", priority: 2 },

  // ── Performance ──
  { patterns: [
    /performanc/i, /lento/i, /\bslow\b/i, /\bbundle\b/i,
    /otimiz/i, /\bcache\b/i, /carregament/i, /lazy.?load/i,
  ], agent: "performance", priority: 3 },

  // ── Refatoração ──
  { patterns: [
    /refactor/i, /refator/i, /c[óo]digo.?duplicad/i, /dead.?code/i,
    /complexidad/i, /simplific/i, /tech.?debt/i,
  ], agent: "refactor", priority: 3 },

  // ── Implementação simples ──
  { patterns: [
    /implement/i, /cri[ra]\b(?!.*projet)/i, /fazer\b/i,
    /c[oó]digo.?novo/i, /feature/i, /funcionalidad/i,
  ], agent: "auto", priority: 1 },

  // ── Documentação ──
  { patterns: [
    /documenta/i, /\breadme\b/i, /api.?doc/i, /\bswagger\b/i,
    /\bchangelog\b/i, /\badr\b/i, /wiki/i,
  ], agent: "documentation", priority: 3 },

  // ── Delivery ──
  { patterns: [
    /\brelease\b/i, /\bdeploy\b/i, /entrega/i, /\bdelivery\b/i,
    /publica/i, /rollback/i, /production/i,
  ], agent: "release-manager", priority: 3 },

  // ── Pipeline commands ──
  { patterns: [
    /^\/pipeline\b/i, /^\/discover/i, /^\/research/i, /^\/debate/i, /^\/explore/i,
    /^\/gate\b/i,
  ], agent: "auto", priority: 4 },
  { patterns: [/^\/plan-create\b/i, /^\/plan-review\b/i], agent: "planner", priority: 4 },
  { patterns: [/^\/self-critique\b/i, /^\/audit-report\b/i], agent: "auditor", priority: 4 },
  { patterns: [/^\/deliver\b/i], agent: "release-manager", priority: 4 },
  { patterns: [/^\/review\b/i], agent: "code-reviewer", priority: 4 },
  { patterns: [/^\/attach\b/i], agent: "auto", priority: 4 },
]

/**
 * Analisa o texto e retorna o agente recomendado.
 * "auto:pipeline" significa: usar auto agent com pipeline.
 */
export function detectAgent(text: string): string | undefined {
  let best: { agent: string; priority: number } | undefined
  for (const intent of INTENT_MAP) {
    for (const pattern of intent.patterns) {
      if (pattern.test(text)) {
        if (!best || intent.priority > best.priority) {
          best = { agent: intent.agent, priority: intent.priority }
        }
        break
      }
    }
  }
  return best?.agent
}

/**
 * Verifica se o texto parece um comando de pipeline (/discover, /research, etc.)
 */
export function detectPipelineCommand(text: string): string | undefined {
  const cmdMatch = text.match(/^\/(\w[\w-]*)/)
  if (!cmdMatch) return undefined
  const cmd = cmdMatch[1].toLowerCase()
  const cmdToAgent: Record<string, string> = {
    discover: "auto", research: "auto", "plan-create": "planner",
    "plan-review": "planner", debate: "auto", "self-critique": "auditor",
    "audit-report": "auditor", deliver: "release-manager",
    explore: "auto", review: "code-reviewer", gate: "auto",
    attach: "auto", pipeline: "auto",
  }
  return cmdToAgent[cmd]
}

/**
 * Verifica se a mensagem do usuário requer execução automática do pipeline.
 * Retorna true para tarefas como "criar projeto", "implementar sistema", etc.
 */
export function needsPipeline(text: string): boolean {
  const agent = detectAgent(text)
  return agent === "auto:pipeline"
}

/**
 * Se a mensagem precisa de pipeline, retorna o texto modificado com /pipeline.
 * Caso contrário, retorna o texto original.
 */
export function maybeEnrichWithPipeline(text: string): string {
  if (needsPipeline(text)) {
    // Se já tem /pipeline, não duplicar
    if (text.trim().startsWith("/pipeline")) return text
    return `/pipeline ${text}`
  }
  return text
}
