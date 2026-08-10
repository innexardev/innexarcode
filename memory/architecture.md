# Engineering OS — Architecture

## Layering
Engineering OS is a layered platform on top of an opencode fork. opencode provides the CLI shell, tool execution, and agent scaffolding; Engineering OS adds the pipeline engine, multi-agent orchestration, and governance layers.

## TUI Layout
3-panel layout: left panel (22%) — file tree + project status; center panel (flex) — chat + agent output; right panel (18%) — session management, TODO view, quick commands.

## Pipeline Engine
13-phase pipeline: discovery → research → planning → architecture → debate → implementation → review → QA → security → self-critique → question → audit → delivery. Each phase has an explicit gate that must pass before the next phase begins.

## Agent Architecture
21 specialized agents orchestrated by the auto agent. Auto never implements — it selects the right agent(s) for the task, delegates via task tool, and synthesizes results. Agents are grouped into Execution, Implementation, Quality, Security, UX/Design, Performance, Refactoring, Documentation, Management, and Consulting roles.

## Dependency Inversion
Core types (Pipeline, Agent, Gate, Context) live in @opencode-ai/core. Implementation packages (cli, agents, pipeline, tui) depend on core. No circular cross-package dependencies.

## Autonomous Engineering (2026-08-05)

- **BacklogEngine** — RICE priority (reach × impact × confidence ÷ effort), persisted to `~/.opencode/backlog.json`.
- **ObservabilityEngine** — dedupe window 1h, error events auto-create backlog bugs, persisted to `~/.opencode/observability.json`.
- **LoopEngine** — maxIterations default 3, escalates after 2 consecutive failures, persisted to `~/.opencode/loop-state.json`.
- **PipelineTemplates** — project types: web, data, infra, product, mobile, api; phases reference the canonical agent roster (validate() checks against KNOWN_AGENTS).
- **Workflow** — `getState`/`decide` now implemented; `state` gained `reload()`.
- **Tools** — 9 new tools registered: backlog-add, backlog-next, backlog-list, backlog-claim, backlog-complete, backlog-cancel, observability-record, template-start, loop-run.

## Senior Quality Gates (2026-08-10)

- **polish** — Definition of Done antes do Delivery: falha em TODO/FIXME/console.log/segredos hardcoded no diff; WARN em URLs hardcoded sem .env.example, build artifacts e CHANGELOG/docs não atualizados quando src/ mudou. Obrigatório em `PHASE_GATES.delivery` e em `DELIVERY_GATES` dos templates.
- **a11y** — WCAG 2.1 AA: not applicable para não-frontend; WARN quando frontend sem axe-core/pa11y/lighthouse; scan ao vivo via `OPENCODE_A11Y_URL`.
- **licenses** — blocagens GPL/AGPL/SSPL/CC-BY-SA quando novas dependências entram (diff de lockfile); fallback para inspeção de node_modules quando license-checker indisponível.
- **compat** — superfície pública alterada (protocol, generated, .schema.ts, .api.ts, openapi, .proto, migrations ALTER/DROP) exige ADR em docs/adr/ antes do Delivery.
- **scope** — anti scope-creep: `.opencode/scope.json` declara arquivos permitidos; diff fora de escopo falha e orienta criar item de backlog.
- **tech-lead** — nova sub-fase de Review (agente cto) nos templates: avalia trade-offs, over-engineering, convenções do repo, legibilidade em 6 meses.
- Todos os gates detectam committed + staged + unstaged + untracked files (branches com HEAD == base não perdem o diff).
- Scripts em `packages/opencode/script/gates/`, registrados em `packages/opencode/src/tool/gate.ts`.
- **i18n** — WARN quando frontend adiciona UI nova sem lib i18n (i18next, next-intl, react-intl, vue-i18n, @lingui).
- **seo** — FAIL bloqueante: página nova sem title/description/OG; WARN: sitemap.xml/robots.txt ausentes, rotas com ID cru.
- **market** — condicional (nunca bloqueia bugfix): detecta endpoint/tela/fluxo pricing novo e verifica demanda registrada (backlog, PRD, docs de requisitos); sem lastro → WARN com orientação de backlog-add.
- **infra-cost** — quando IaC (*.tf/*.hcl) muda no diff, roda `infracost breakdown`; WARN se infracost não instalado.
- Todos os gates de produto (seo/market/i18n) checam committed + staged + unstaged.
- **Dispatcher (11.3)** — `packages/core/src/pipeline/dispatcher.ts` + tool `dispatcher-route`: roteia especialistas (frontend, backend, database, infra, security, mobile, data, qa-test, design-system, ux-writing, support) por tipo de arquivo (peso 3), keywords do goal (peso 2) e template (peso 1); computa partições independentes por diretório de topo (paralelismo seguro 13.2); mapeia fase → agente do pipeline.
- **onboarding gate (12.5)** — feature client-facing nova sem declaração de onboarding (features.json, onboarding.md, ou `// onboarding: true|false` inline) → WARN.
- **analytics gate (12.6)** — feature client-facing nova sem eventos (analytics.json, analytics.md, ou track()/gtag/posthog/amplitude inline) → WARN.
- Dispatcher + 2 gates = seções 11.3, 12.5, 12.6 do docs/melhorias-nivel-senior.md.
- **MergeCoordinator (13.3/13.4)** — `packages/core/src/pipeline/merge-coordinator.ts` + tool `merge-coordinator`: valida integração de branches paralelas SEM merge cego. Clona o repo em dir temporário, faz merge simulado sequencial (mais antiga primeiro), roda a suite de testes COMPLETA no resultado (pega conflito semântico entre diffs individualmente válidos), reporta branches conflitantes sem descartar. Nunca toca o working tree real.
