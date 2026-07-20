# Engineering OS — Checklist de Build

## Pré-requisitos
- [ ] Bun instalado (≥1.0)
- [ ] Git configurado
- [ ] Fork do opencode em /root/opencode-engos

## Typecheck
- [ ] packages/core — bun typecheck
- [ ] packages/opencode — bun typecheck
- [ ] packages/tui — bun typecheck

## Módulos Core
- [ ] Pipeline (13 fases + TODO com gates)
- [ ] Context Engine (scan, impact, graph)
- [ ] ADR (auto-numbered, markdown, CRUD)
- [ ] Quality Board (12 dimensões, score 0-100)
- [ ] Artifact (auto-detect, compact, tokens)

## Ferramentas (tools)
- [ ] context-engine (scan, query, impact)
- [ ] gate (run-gates, run-gate, status)

## Agentes (21)
- [ ] auto (orchestrator)
- [ ] planner, architect
- [ ] qa, qa-breaker, code-reviewer, questionador
- [ ] security, auditor, a11y
- [ ] ux-reviewer, design-critic
- [ ] performance
- [ ] refactor
- [ ] documentation
- [ ] release-manager, po
- [ ] ceo, cto, teacher, mentor

## TUI Components
- [ ] LeftPanel (session info + file explorer)
- [ ] RightPanel (sessions + pipeline status)
- [ ] MissionControl (health radar + agent activity)
- [ ] MissionView (full-screen dashboard)
- [ ] FileExplorer (file tree)
- [ ] GraphView (dependency tree)
- [ ] Scorecard (quality scores)
- [ ] ArtifactCard (collapsible artifact)
- [ ] ArtifactPanel (sidebar)

## Commands
- [ ] discover
- [ ] research
- [ ] plan-create
- [ ] plan-review
- [ ] debate
- [ ] self-critique
- [ ] audit-report
- [ ] deliver
- [ ] init
- [ ] review

## Memória e Políticas
- [ ] memory/ (9 arquivos)
- [ ] policies/ (8 arquivos)
- [ ] .opencode/constitution.md

## Quality Gates
- [ ] Build
- [ ] Lint
- [ ] Typecheck
- [ ] Tests
- [ ] Coverage
- [ ] Security

## Documentação
- [ ] docs/engineering-os.md
- [ ] CHECKLIST.md (esta)
