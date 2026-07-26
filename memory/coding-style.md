# Engineering OS — Coding Style

## Base Conventions
Follow opencode conventions as defined in AGENTS.md at the fork root. This includes the 8-layer constitution, 13-phase pipeline, and all quality gates.

## TypeScript
Use plain TypeScript interfaces for data types and API contracts. Use Effect Schema (Schema) only for serialization/deserialization boundaries (config files, network messages, persistent state). Context: Schema.Literal requires union of literals as single arg; avoid Schema for runtime-only data structures due to readonly array issues.

## Naming
- Portuguese descriptions for Engineering OS-specific agents, phases, and gates (e.g., "Fase 1 — Discovery", "Agente de Qualidade")
- camelCase for all code identifiers (variables, functions, methods, parameters)
- snake_case for database column names and configuration file keys
- PascalCase for classes, interfaces, types, and React components
- UPPER_SNAKE_CASE for constants and environment variables

## File Organization
One feature per directory. Feature directories contain: types.ts, service.ts, index.ts. No barrel exports — use explicit named imports. Tests colocated in `__tests__/` subdirectory.

## Imports
Group: 1) built-in/stdlib, 2) external packages, 3) @opencode-ai/core, 4) internal packages, 5) relative imports. Groups separated by blank line. No wildcard imports.

## Formatting
Prettier with 2-space indent, 100 char width. No semicolons in TypeScript (opencode convention). Single quotes for strings. Trailing commas where valid.
