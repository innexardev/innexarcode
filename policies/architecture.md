# Architecture Policy

## ADRs (Architecture Decision Records)

Every significant technical decision MUST be recorded as an ADR in `memory/decisions.md`:

- Title, status (proposed/accepted/deprecated), context, decision, consequences
- Cover: why this approach over alternatives, trade-offs accepted
- Rejected alternatives documented with rationale

## Context Compression

Never send 250 files to an agent. Instead, compose from:

```
Architecture Summary  →  API Summary  →  DB Summary  →  Dependency Summary
```

These summaries live in `memory/` and are updated when the structure changes.

## Virtual Architect Validation

Before ANY implementation, the architect agent validates:

- **SOLID?** Does this break single responsibility, open/closed, Liskov, interface segregation, dependency inversion?
- **Tech debt?** Does this introduce technical debt? Is there existing debt being compounded?
- **Better lib?** Is there a library that already solves this? Are we reinventing?
- **Better pattern?** Does the domain suggest a different architectural pattern (event-driven, CQRS, saga, etc.)?

If the answer to any is YES → debate before implementation.

## Repository Index

Generated on first execution and when structure changes:

```
Repository Scan → Dependency Graph → Architecture Graph → API Graph
→ Database Graph → Routing Graph → Component Graph → State Graph → Event Graph
```

Saved to `memory/repository-index.md`.

## Multi-Agent Architecture

- Planner orchestrates subagents via `task` tool
- Each subagent runs in its own isolated context
- Developer NEVER reviews own code — use separate agents per role
