# Engineering OS — Documentação Completa

## Visão Geral

O Engineering OS é uma plataforma construída sobre o OpenCode que transforma
agentes de IA em um sistema de engenharia completo com pipeline, qualidade,
memória e orquestração multi-agente.

## Arquitetura

### Em Camadas

```
┌─────────────────────────────────────────────┐
│  TUI (3 painéis + Mission Control + Artifacts)│
├─────────────────────────────────────────────┤
│  Agentes (21 especialistas)                  │
├─────────────────────────────────────────────┤
│  Comandos CLI (10 pipeline commands)         │
├─────────────────────────────────────────────┤
│  Core (Pipeline, Context Engine, ADR, Quality)│
├─────────────────────────────────────────────┤
│  Memória (memory/) + Políticas (policies/)   │
├─────────────────────────────────────────────┤
│  Constituição (.opencode/constitution.md)    │
└─────────────────────────────────────────────┘
```

### Módulos Core

| Módulo | Localização | Descrição |
|--------|-------------|-----------|
| Pipeline | packages/core/src/pipeline/ | 13 fases + TODO com gates |
| Context Engine | packages/core/src/context-engine/ | Grafo de dependências |
| ADR | packages/core/src/adr/ | Decision Log automático |
| Quality Board | packages/core/src/quality/ | Score 0-100 em 12 dimensões |
| Artifact | packages/core/src/artifact/ | Message Artifacts system |

### Agentes (21)

**Execução**: auto, planner, architect
**Qualidade**: qa, qa-breaker, code-reviewer, questionador
**Segurança**: security, auditor, a11y
**UX/Design**: ux-reviewer, design-critic
**Performance**: performance
**Refatoração**: refactor
**Documentação**: documentation
**Gestão**: release-manager, po
**Consultoria**: ceo, cto, teacher, mentor

### Pipeline de 13 Fases

Discovery → Research → Planning → Architecture → Debate →
Implementation → Review → QA → Security → Self-Critique →
Question → Audit → Delivery

### Comandos CLI (10)

discover, research, plan-create, plan-review, debate,
self-critique, audit-report, deliver, init, review

### Tools Autônomas (9)

backlog-add, backlog-next, backlog-list, backlog-claim,
backlog-complete, backlog-cancel, observability-record,
template-start, loop-run

### Quality Board

Avalia 12 dimensões com score 0-100:
architecture, backend, frontend, database, security,
performance, seo, accessibility, tests, documentation,
devops, ux

### Quality Gates (8)

build → lint → types → tests → coverage → security → docker → deploy

### Message Artifacts

Sistema que colapsa conteúdo grande (>30 linhas) em cartões
expansíveis com detecção automática de tipo, contagem de tokens,
e preview inteligente.

## Como Usar

### Iniciar uma missão
1. Selecione o agente `auto`
2. Descreva o objetivo
3. O auto agent orquestra o pipeline completo

### Verificar qualidade
```
/gate run-gates
```

### Ver score do projeto
Use o QualityEngine programaticamente ou via tool.

### Criar ADR
Use o ADR service ou o auto agent que cria automaticamente.

### Visualizar grafo
O Context Engine constrói o grafo automaticamente ao escanear.

## Estrutura de Diretórios

```
.opencode/
  constitution.md
memory/
  architecture.md
  patterns.md
  coding-style.md
  business-rules.md
  decisions.md
  design-system.md
  database.md
  api-contracts.md
  lessons.md
policies/
  engineering.md
  architecture.md
  backend.md
  frontend.md
  security.md
  testing.md
  ux.md
  performance.md
packages/core/src/
  pipeline/        — Pipeline engine + TODO
  context-engine/  — Dependency graph
  adr/             — Decision records
  quality/         — Quality Board
  artifact/        — Message artifacts
packages/tui/src/
  panel/           — LeftPanel, RightPanel, MissionControl, Explorer, GraphView, Scorecard, Artifacts
  component/       — Artifact card
  routes/          — Session, Mission views
  context/         — Route types (incl. MissionRoute)
```

## Thresholds de Qualidade

- Overall mínimo: 80/100
- Architecture: ≥ 85
- Security: ≥ 90
- Tests: ≥ 80
- Documentation: ≥ 80
- DevOps: ≥ 80
