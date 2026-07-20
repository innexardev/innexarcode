# Backend Policy

## Effect-Based Service Architecture

Backend services follow Effect TS patterns:

- Every service has a typed interface (Effect.Service)
- Dependencies injected via Effect context
- No global state — all state passed through layers
- Error handling via Effect's typed error channels (never throw raw)

## InstanceState

Per-project state managed via `InstanceState`:

- Tracks active task, phase, and agent state
- Persisted to `.opencode/state.json`
- Restored on session resume
- Concurrent operation detection (no parallel destructive writes)

## Task Delegation

Complex backend work is delegated via the `task` tool:

- Backend agent runs in isolated sub-context
- Receives only relevant module summaries (context-compressed)
- Reports progress via structured output
- Returns diff + test results + any concerns

## API Design Rules

- OpenAPI 3.0 specification for every endpoint
- Versioned endpoints (`/v1/`, `/v2/`)
- Consistent error response shape: `{ error: string, code: string, details?: unknown }`
- Rate limiting by default
- All inputs validated at the boundary (Zod/Ajv)
- N+1 query detection in code review
- Indexes confirmed before query-heavy endpoints ship
