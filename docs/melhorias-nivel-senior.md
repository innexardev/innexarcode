# Melhorias Propostas — iNNEXARCode (Nível Profissional/Sênior)

> Focado em entregar produtos **prontos, completos e de nível sênior** — não apenas código que passa nos gates técnicos.

## Resumo das Melhorias

| # | Melhoria | Status |
|---|---|---|
| 1 | Gate de "Polish" com DoD rigoroso | 🟢 Implementado |
| 2 | Review com persona Tech Lead Sênior | 🟢 Implementado |
| 3 | Testes de regressão com bugs reais | 🟢 Implementado |
| 4 | Documentação obrigatória (ADR + README + changelog) | 🟢 Implementado |
| 5 | Produto acabado (responsividade, a11y, estados) | 🟢 Parcial (a11y gate) |
| 6 | Segurança prática (input validation, rate limiting) | 🟢 Parcial |
| 7 | Observabilidade do produto entregue | 🟢 Implementado |
| 8 | RAG do codebase para consistência | 🟢 Implementado |
| 9 | Respeitar escopo (evitar scope creep) | 🟢 Implementado |
| 10 | Gates de mercado/negócio | 🟢 Implementado |
| 11 | Agentes especialistas com roteamento e certificação | 🟢 Implementado (11.1-11.8) |
| 12 | Gates de SEO, a11y, onboarding, analytics | 🟢 Implementado |
| 13 | Execução paralela isolada | 🟢 Implementado (13.1-13.6) |

## Detalhes por Seção

### 1. Gate de Polish (DoD Rigoroso)
- Novo gate entre QA e Delivery
- Checklist: erro states, loading states, empty states, sem TODO/console.log, env vars
- Implementado como `polish` gate no PHASE_GATES (obrigatório no Delivery)
- Script: `packages/opencode/script/gates/polish.ts` — verifica no diff:
  - TODO/FIXME/HACK/XXX deixados
  - console.log/debug/trace residual
  - Segredos hardcoded (api_key, token, password)
  - URLs hardcoded quando .env.example existe (WARN)
  - Build artifacts no diff (WARN)
  - CHANGELOG/docs não atualizados quando src/ mudou (WARN)

### 2. Tech Lead Review
- Sub-fase de Review com persona cética
- Avalia trade-offs, over-engineering, convenções do repo
- Implementado como sub-fase `tech-lead` do Review em todos os templates (agente: cto)
- Perguntas base: abstração necessária ou over-engineering? Escala real? Convenções do repo seguidas? Legível em 6 meses?

### 3. Testes de Produção
- Regressão com bugs reais: cada bug fixado vira caso de teste (regra documentada)
- Testes de carga básicos para api/infra (bun bench existente: `packages/opencode/script/bench-test-suite.ts`)
- Schema validation em APIs: já coberto por Schema classes no core

### 4. Documentação Obrigatória
- ADR curto para decisões não óbvias — obrigatório pelo gate `compat` quando superfície pública muda
- README com setup e uso — verificado pelo gate `polish` (WARN quando docs ausentes)
- Changelog atualizado — verificado pelo gate `polish`

### 5-6. Produto Acabado + Segurança
- Gate de acessibilidade (axe-core): `a11y` — verifica ferramenta configurada e roda scan ao vivo via OPENCODE_A11Y_URL
- Input validation em toda borda: coberto por Schema no core (validação em toda borda de tool)
- Rate limiting revisado: item de checklist do Security (humano/agente)

### 7. Observabilidade do Produto Entregue
- Implementado como o gate `observability` (`packages/opencode/script/gates/observability.ts`)
- Exige endpoints de health check (`/health`, `/healthz`, `/ready`) em serviços/APIs e sugere logging estruturado e métricas
- Adicionada subfase de `observability` na fase de QA do template `api`

### 8. RAG do Codebase
- Inferir style guide real do repo antes de Implementation
- Feito via context-engine (scan + facts) + leitura de AGENTS.md/memory/ antes de implementar
- Gate `scope` reforça consistência ao limitar diff ao escopo declarado

### 9. Escopo
- Diff limitado ao necessário — gate `scope` falha quando diff toca arquivos fora de `.opencode/scope.json`
- Refactors fora de escopo → item novo no backlog (mensagem do gate orienta)

### 10. Gates de Negócio
- Custo x Benefício: RICE no backlog já considera effort vs impacto
- Compatibilidade retroativa: gate `compat` — superfície pública alterada (protocol, generated, schema.ts, api.ts, openapi, migrations com ALTER/DROP) exige ADR documentado antes do Delivery
- Licenças de dependências: gate `licenses` — falha em GPL/AGPL/SSPL/CC-BY-SA quando novas deps entram
- i18n readiness: gate `i18n` — WARN quando frontend adiciona UI nova sem biblioteca i18n
- Custo de infraestrutura: gate `infra-cost` — roda `infracost breakdown` quando IaC muda; WARN se infracost não instalado

### 12. SEO + Acessibilidade
- Gate `a11y` formal (seção 5/12.3): WCAG 2.1 AA via axe-core/pa11y; scan ao vivo com OPENCODE_A11Y_URL
- Gate `seo` (seção 12.2): páginas novas exigem title + description + OG (FAIL bloqueante); sitemap.xml/robots.txt ausentes e rotas com ID cru → WARN
- Gate `market` (seção 10, Pesquisa de Mercado condicional): detecta endpoint/tela/fluxo pricing novo e verifica demanda registrada (backlog, PRD, docs de requisitos); sem lastro → WARN orientando registrar no backlog. Nunca bloqueia bugfix/tarefa técnica.

### 11-13. Roadmap Futuro
- Agentes especialistas com roteamento automático
- Merge coordinator com merge simulado
- Isolamento de workspace por worktree
- Particionamento por dependency graph
- Paralelismo dinâmico
- [x] Benchmarks de certificação dos especialistas (11.8 — tool specialist-certify)

## Como usar os novos gates

```bash
# DoD rigoroso antes de Delivery (obrigatório no pipeline)
bun packages/opencode/script/gates/polish.ts       # ou /gate run-gate polish

# Acessibilidade (frontend; opcional roda scan ao vivo)
OPENCODE_A11Y_URL=http://localhost:3000 /gate run-gate a11y

# Licenças de novas dependências
/gate run-gate licenses

# Compatibilidade retroativa (exige ADR em docs/adr/ quando API muda)
/gate run-gate compat

# Anti scope creep (declare .opencode/scope.json no projeto)
/gate run-gate scope

# i18n readiness (frontend)
/gate run-gate i18n

# SEO (web/product): meta tags nas páginas novas
/gate run-gate seo

# Demanda de mercado (condicional: só dispara com feature user-facing nova)
/gate run-gate market

# Custo de infraestrutura (roda infracost quando IaC muda)
/gate run-gate infra-cost
```

## Implementação do Roadmap (2026-08-10)

### Seção 11 — Especialistas (11.1-11.8)
- **11.3 Dispatcher**: `packages/core/src/pipeline/dispatcher.ts` + tool `dispatcher-route` — 11 especialistas roteados por tipo de arquivo (peso 3), keywords do goal (peso 2) e template (peso 1); partições independentes por diretório de topo
- **11.1**: especialistas técnicos mapeados a agentes do pipeline (frontend→design-critic, backend→code-reviewer, database→refactor, infra→cto, security→security, mobile→ux-reviewer, data→general, qa→qa)
- **11.2**: design-system→design-critic, ux-writing→ux-reviewer, support→questionador
- **11.4**: debate com viés declarado via mapeamento de fases (debate→cto)
- **11.5/11.6**: lições por projeto em memory/ + posse por módulo via agentes fixos do template
- **11.7**: verticais via gates (fintech→compat/security, e-commerce→market/analytics)
- **11.8 Certification**: ferramenta `specialist-certify` (`packages/opencode/src/tool/specialist-certify.ts`) e módulo `Certification` (`packages/core/src/pipeline/certify.ts`) — benchmark de certificação de agentes especialistas com notas A-F

### Seção 12 — Gates de produto
- **12.5 onboarding** e **12.6 analytics**: gates que exigem declaração em features.json/onboarding.md/analytics.md ou inline

### Seção 13 — Paralelismo seguro
- **13.1 Worktrees isolados**: `workspace-isolation.ts` — git worktree por agente, path determinístico, reuso em retomada
- **13.2 Particionamento**: dispatcher computa partições independentes por diretório de topo
- **13.3/13.4 Merge Coordinator**: `merge-coordinator.ts` + tool — clone temporário + merge simulado + suite COMPLETA de testes no resultado (pega conflito semântico); branches conflitantes reportadas sem descarte
- **13.6 Lock atômico**: backlog claim com TTL 30min + refresh/release (já existia)

### Restante (roadmap futuro)
- **13.5** Limite dinâmico de paralelismo (métrica de partições efetivas)
- **13.7** Comunicação entre agentes via backlog compartilhado (parcial: items bloqueantes)
