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
| 7 | Observabilidade do produto entregue | 🔴 Roadmap |
| 8 | RAG do codebase para consistência | 🟢 Implementado |
| 9 | Respeitar escopo (evitar scope creep) | 🟢 Implementado |
| 10 | Gates de mercado/negócio | 🟢 Implementado |
| 11 | Agentes especialistas com roteamento | 🔴 Roadmap |
| 12 | Gates de SEO, a11y, onboarding | 🟢 Implementado (a11y) |
| 13 | Execução paralela isolada | 🔴 Roadmap |

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
- Roadmap: logging estruturado + health check + métricas no código gerado pelos templates
- Hoje o ObservabilityEngine cobre o pipeline, não o produto

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
- i18n readiness: checklist para templates web/mobile (manual)

### 11-13. Roadmap Futuro
- Agentes especialistas com roteamento automático
- Merge coordinator com merge simulado
- Isolamento de workspace por worktree
- Particionamento por dependency graph
- Paralelismo dinâmico
- Benchmarks de certificação dos especialistas

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
```
