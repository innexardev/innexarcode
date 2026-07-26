# Engineering OS Constitution

## Camada 1 — Qualidade Imutável

Estas regras nunca podem ser violadas:

1. **Nunca gerar código duplicado** — Sempre extrair para função/módulo reutilizável
2. **Sempre usar TypeScript strict** — strict mode é obrigatório
3. **Sempre documentar APIs** — OpenAPI/Swagger para toda rota
4. **Sempre gerar testes** — Toda funcionalidade nova tem teste
5. **Sempre tratar erros** — Nenhuma operação pode falhar silenciosamente
6. **Sempre usar logs estruturados** — console.log não é suficiente
7. **Nunca deixar TODO no código** — TODO precisa de issue ou é removido
8. **Sempre validar entradas** — Zod/Joi para toda API e formulário
9. **Sempre usar paginação** — Listas sem paginação são proibidas
10. **Sempre seguir separação em camadas** — Controller → Service → Repository
11. **Sempre atualizar documentação** — Código e docs devem estar sincronizados
12. **Sempre medir performance** — Nada em produção sem baseline
13. **Sempre considerar acessibilidade** — WCAG AA mínimo
14. **Sempre considerar SEO** — Meta tags, OG, structured data
15. **Nunca considerar feature pronta sem pipeline completo**

## Camada 2 — Pipeline Obrigatório

Toda tarefa DEVE passar pelo pipeline completo:

Discovery → Research → Planning → Architecture → Plan Review →
Implementation → Code Review → QA → Security → Performance →
UX Review → Documentation → Release → Done

Nenhuma fase pode ser pulada.

## Camada 3 — Definition of Done

Uma feature só está completa quando:

☐ Código implementado
☐ Testes escritos e passando
☐ Documentação atualizada
☐ Tratamento de erro implementado
☐ Logs adicionados
☐ Validação de entrada
☐ Permissões verificadas
☐ Migrations criadas (se aplicável)
☐ Seeds criados (se aplicável)
☐ Performance verificada
☐ Segurança revisada
☐ Acessibilidade verificada
☐ SEO verificado (se aplicável)

## Camada 4 — Quality Gates

Antes de qualquer entrega:

Build → ✅ Deve compilar
Lint → ✅ Sem erros
Types → ✅ Typecheck passa
Tests → ✅ 100% dos testes passam
Coverage → ✅ Mínimo 80%
Security → ✅ Sem vulnerabilidades conhecidas

Se QUALQUER gate falhar:
→ Corrigir
→ Testar novamente
→ Revisar novamente
→ Só então entregar

## Camada 5 — Quality Board Scores

Mínimos aceitáveis por dimensão:

- Architecture: ≥ 85
- Backend: ≥ 85
- Frontend: ≥ 80
- Database: ≥ 85
- Security: ≥ 90
- Performance: ≥ 80
- Tests: ≥ 80
- Documentation: ≥ 80
- DevOps: ≥ 80
- UX: ≥ 75
- SEO: ≥ 70
- Accessibility: ≥ 75

Overall mínimo: 80

## Camada 6 — Deadlines Inteligentes

Se o prazo está apertado:
1. Reduzir escopo (nunca pular qualidade)
2. Priorizar core business
3. Comunicar riscos
4. Jamais sacrificar Architecture, Security, ou Tests
