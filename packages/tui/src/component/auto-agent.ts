/**
 * Auto Agent Switch — analisa a mensagem do usuário e troca o agente
 * automaticamente conforme o assunto.
 *
 * Mapeia palavras-chave para agentes especialistas.
 */

// Intenções → agente
const INTENT_MAP: { patterns: RegExp[]; agent: string }[] = [
  // QA / Testes
  { patterns: [/test(?:e|ar)?/i, /qa/i, /qualidade/i, /cobertura/i, /coverage/i, /bug/i, /falha/i, /quebr/i], agent: "qa" },
  { patterns: [/tenta quebrar/i, /break.?test/i, /adversari/i], agent: "qa-breaker" },

  // Segurança
  { patterns: [/seguranç/i, /security/i, /owasp/i, /vulnerabil/i, /cve/i, /injection/i, /xss/i, /csrf/i], agent: "security" },
  { patterns: [/audit/i, /auditoria/i, /revis[ãa]o final/i], agent: "auditor" },

  // Arquitetura
  { patterns: [/arquitetur/i, /architecture/i, /estrutur/i, /m[óo]dulo/i, /design.?pattern/i, /solid/i], agent: "architect" },
  { patterns: [/impacto/i, /impact analysis/i, /dependênci/i, /grafo/i], agent: "cto" },

  // Planejamento
  { patterns: [/plano/i, /plan/i, /planejament/i, /roadmap/i, /sprint/i, /tarefa/i, /task/i, /todo/i], agent: "planner" },
  { patterns: [/product.?owner/i, /requisito/i, /hist[óo]ri/i, /user.?story/i], agent: "po" },

  // Review
  { patterns: [/review/i, /revisar/i, /code.?review/i, /aprov/i, /pull.?request/i, /pr\b/i], agent: "code-reviewer" },
  { patterns: [/ux/i, /usabilidade/i, /design.?review/i, /interface/i], agent: "ux-reviewer" },
  { patterns: [/design.?critic/i, /criticar/i, /visual/i, /aparênci/i], agent: "design-critic" },

  // Performance
  { patterns: [/performanc/i, /lento/i, /slow/i, /bundle/i, /otimiz/i, /cache/i, /carregament/i], agent: "performance" },

  // Refatoração
  { patterns: [/refactor/i, /refator/i, /c[óo]digo.?duplicad/i, /dead.?code/i, /complexidad/i], agent: "refactor" },

  // Documentação
  { patterns: [/documenta/i, /readme/i, /api.?doc/i, /swagger/i, /changelog/i, /adr\b/i], agent: "documentation" },

  // Delivery
  { patterns: [/release/i, /deploy/i, /entrega/i, /delivery/i, /publica/i, /rollback/i], agent: "release-manager" },

  // Negócio / Estratégia
  { patterns: [/neg[óo]cio/i, /business/i, /valor/i, /roi/i, /custo/i, /estrat[ée]gi/i], agent: "ceo" },
  { patterns: [/tecnologia/i, /tech.?debt/i, /d[ée]vida.?t[ée]cnica/i, /stack/i], agent: "cto" },

  // Ensino / Mentoria
  { patterns: [/ensin/i, /expliqu/i, /mentor/i, /ajud/i, /como.?funcion/i, /tutoria/i], agent: "teacher" },
  { patterns: [/melhor[iu]?[aã]o/i, /boa.?pr[áa]tic/i, /code.?smell/i, /refinament/i], agent: "mentor" },
]

const AGENT_AUTO = "auto"

/**
 * Analisa o texto do usuário e retorna o agente recomendado,
 * ou undefined se não houver correspondência clara.
 */
export function detectAgent(text: string): string | undefined {
  for (const intent of INTENT_MAP) {
    for (const pattern of intent.patterns) {
      if (pattern.test(text)) {
        return intent.agent
      }
    }
  }
  return undefined
}

/**
 * Verifica se o texto parece um comando de pipeline (/discover, /research, etc.)
 */
export function detectPipelineCommand(text: string): string | undefined {
  const cmdMatch = text.match(/^\/(\w[\w-]*)/)
  if (!cmdMatch) return undefined

  const cmd = cmdMatch[1].toLowerCase()
  const cmdToAgent: Record<string, string> = {
    discover: "auto",
    research: "auto",
    "plan-create": "planner",
    "plan-review": "planner",
    debate: "auto",
    "self-critique": "auditor",
    "audit-report": "auditor",
    deliver: "release-manager",
    explore: "auto",
    review: "code-reviewer",
    gate: "auto",
  }
  return cmdToAgent[cmd]
}
