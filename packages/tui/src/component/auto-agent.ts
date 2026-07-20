/**
 * Auto Agent Switch — analisa a mensagem do usuário e troca o agente
 * automaticamente conforme o assunto da conversa.
 */

type IntentGroup = { patterns: RegExp[]; agent: string; priority: number }

const INTENT_MAP: IntentGroup[] = [
  // ── QA / Testes (prioridade alta) ──
  { patterns: [
    /test(?:e|ar|es)?\b/i, /\bqa\b/i, /qualidade/i, /cobertur/i, /coverage/i,
    /\bbug\b/i, /falha/i, /quebr/i, /erro.?test/i, /assert/i,
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
    /rbac\b/i, /cors\b/i, /jwt.?secret/i,
  ], agent: "security", priority: 3 },
  { patterns: [
    /audit/i, /auditori/i, /revis[ãa]o.?final/i, /conformidad/i, /compliant/i,
  ], agent: "auditor", priority: 2 },

  // ── Arquitetura ──
  { patterns: [
    /arquitetur/i, /\barchitecture\b/i, /estrutur/i, /m[óo]dulo/i,
    /design.?pattern/i, /\bsolid\b/i, /clean.?arch/i, /camada/i,
    /separação/i, /dependenc/i, /invers[ãa]o/i,
  ], agent: "architect", priority: 3 },
  { patterns: [
    /impacto/i, /impact.?analysis/i, /dependência/i, /grafo/i,
    /afeta\b/i, /quem.?mais.?afeta/i,
  ], agent: "cto", priority: 2 },

  // ── Planejamento ──
  { patterns: [
    /plano\b/i, /\bplan\b/i, /planejament/i, /roadmap/i, /\bsprint\b/i,
    /tarefa/i, /\btask\b/i, /\btodo\b/i, /prioridad/i,
    /cronograma/i, /hist[óo]ria/i, /user.?story/i,
    /o.?que.?precis[oa]\b/i, /escopo/i,
  ], agent: "planner", priority: 3 },
  { patterns: [
    /product.?owner/i, /requisito/i, /stakeholder/i, /backlog/i,
    /acceptance.?criter/i,
  ], agent: "po", priority: 2 },

  // ── Code Review ──
  { patterns: [
    /review\b/i, /revisar/i, /code.?review/i, /\bpr\b/i,
    /pull.?request/i, /aprov/i, /merge/i, /mudanç/i,
  ], agent: "code-reviewer", priority: 3 },
  { patterns: [
    /\bux\b/i, /usabilidad/i, /design.?review/i, /interface/i,
    /experiência.?do.?usu[áa]ri/i,
  ], agent: "ux-reviewer", priority: 2 },
  { patterns: [
    /design.?critic/i, /criticar/i, /visual/i, /aparência/i,
    /estilo/i, /cores?/i, /layout/i,
  ], agent: "design-critic", priority: 1 },

  // ── Performance ──
  { patterns: [
    /performanc/i, /lento/i, /\bslow\b/i, /\bbundle\b/i,
    /otimiz/i, /\bcache\b/i, /carregament/i, /lazy.?load/i,
    /tempo.?de.?respost/i, /latênci/i, /throughput/i,
  ], agent: "performance", priority: 3 },

  // ── Refatoração ──
  { patterns: [
    /refactor/i, /refator/i, /c[óo]digo.?duplicad/i, /dead.?code/i,
    /complexidad/i, /simplific/i, /melhor[iu]?[aã]r/i,
    /tech.?debt/i, /d[ée]vida.?t[ée]cnic/i,
  ], agent: "refactor", priority: 3 },

  // ── Implementação ──
  { patterns: [
    /implement/i, /cri[ra]\b/i, /constru[ií]r/i, /desenvolv/i,
    /codif[ií]c/i, /fazer\b/i, /c[oó]digo.?novo/i,
    /feature/i, /funcionalidad/i,
  ], agent: "auto", priority: 1 },

  // ── Documentação ──
  { patterns: [
    /documenta/i, /\breadme\b/i, /api.?doc/i, /\bswagger\b/i,
    /\bchangelog\b/i, /\badr\b/i, /wiki/i,
    /coment[áa]ri/i, /manual/i,
  ], agent: "documentation", priority: 3 },

  // ── Delivery / Release ──
  { patterns: [
    /\brelease\b/i, /\bdeploy\b/i, /entrega/i, /\bdelivery\b/i,
    /publica/i, /rollback/i, /production/i, /prod\b/i,
    /ci.?cd\b/i, /pipeline.?deploy/i,
  ], agent: "release-manager", priority: 3 },

  // ── Negócio / Estratégia ──
  { patterns: [
    /neg[óo]cio/i, /\bbusiness\b/i, /\bvalor\b/i, /\broi\b/i,
    /\bcusto\b/i, /estrat[ée]gi/i, /investiment/i,
    /retorno/i, /prioridad/i,
  ], agent: "ceo", priority: 2 },
  { patterns: [
    /tecnologia/i, /tech.?debt/i, /stack/i, /linguagen/i,
    /frameworks?/i, /tecnolog/i,
  ], agent: "cto", priority: 2 },

  // ── Ensino / Mentoria ──
  { patterns: [
    /ensin/i, /expliqu/i, /mentor/i, /ajud[iu]?\b/i,
    /como.?funcion/i, /tutoria/i, /aprender/i,
    /entender/i, /o.?que.?[ée]\b/i,
  ], agent: "teacher", priority: 2 },
  { patterns: [
    /melhor[iu]?[aã]o/i, /boa.?pr[áa]tic/i, /code.?smell/i,
    /refinament/i, /elegant/i, /clean.?code/i,
  ], agent: "mentor", priority: 2 },

  // ── Pipeline commands ──
  { patterns: [
    /^\/discover/i, /^\/research/i, /^\/debate/i, /^\/explore/i,
    /^\/gate\b/i,
  ], agent: "auto", priority: 4 },
  { patterns: [/^\/plan-create\b/i, /^\/plan-review\b/i], agent: "planner", priority: 4 },
  { patterns: [/^\/self-critique\b/i, /^\/audit-report\b/i], agent: "auditor", priority: 4 },
  { patterns: [/^\/deliver\b/i], agent: "release-manager", priority: 4 },
  { patterns: [/^\/review\b/i], agent: "code-reviewer", priority: 4 },
  { patterns: [/^\/attach\b/i], agent: "auto", priority: 4 },
]

/**
 * Analisa o texto do usuário e retorna o agente recomendado.
 * Usa o padrão de maior prioridade que der match.
 */
export function detectAgent(text: string): string | undefined {
  let best: { agent: string; priority: number } | undefined
  for (const intent of INTENT_MAP) {
    for (const pattern of intent.patterns) {
      if (pattern.test(text)) {
        if (!best || intent.priority > best.priority) {
          best = { agent: intent.agent, priority: intent.priority }
        }
        break  // found match for this group, move to next
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
    attach: "auto",
  }
  return cmdToAgent[cmd]
}
