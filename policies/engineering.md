# Engineering Policy — SDLC & Quality Gates

## 13-Phase Pipeline

| # | Phase | Command | Description |
|---|-------|---------|-------------|
| 1 | Discovery | `discover` | Scan README, AGENTS.md, package.json, .env.example, docker, migrations, CI, tsconfig. Save to `.opencode/project.json` |
| 2 | Research | `research` | Check official docs before implementing API/framework. `research-check` for breaking changes |
| 3 | Planning | `plan-create` | Markdown plan in `.opencode/plans/YYYY-MM-DD-tarefa.md`. Review for auth/logging/audit/rate-limit/cache/backup |
| 4 | Architecture | `architect` | ADRs, interfaces, schema, tech decisions |
| 5 | Debate | `debate` | Pass proposal through Backend, QA, Security, Architect agents |
| 6 | Implementation | — | Domain agents in PARALLEL (backend + frontend + db) |
| 7 | Review | `code-reviewer` | Bugs, security, performance, correctness |
| 8 | QA | `qa` | Tests + coverage. `qa-breaker` tries to break the app |
| 9 | Security | `security` | OWASP, injection, secrets, auth |
| 10 | Self-Critique | `self-critique` | Incomplete? Duplicated? Dead? Orphaned route? Insecure endpoint? |
| 11 | Question | `questionador` | "What could be missing?" until no one finds anything |
| 12 | Audit | `audit-report` | Files changed, coverage, performance, security, score + grade |
| 13 | Delivery | `release-manager` | Checklist mandatory — only release if everything passes |

## Quality Gates

Build → Lint → Types → Tests → Coverage → Performance → Security → Review → Smoke Test

**If ANY gate fails:** correct → test again → review again. No exceptions.

## Pipeline CLI

- `discover` — scan project structure
- `research` <topic> — research before implementing
- `plan-create` — create implementation plan
- `debate` — multi-agent review cycle
- `audit-report` — generate final audit
- `deliver` — release manager checklist

No phase may be skipped. Each phase must complete before the next begins.
