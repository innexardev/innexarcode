# Engineering OS — Architecture Decision Records

## ADR-001: Use opencode fork as foundation
**Date:** 2026-07-20 | **Status:** Accepted
**Context:** Engineering OS needs a CLI framework with tool execution, agent scaffolding, and TUI capabilities. Building from scratch would take months.
**Decision:** Fork opencode and layer Engineering OS on top. opencode provides CLI shell, tool sandboxing, session management, and permission system. Engineering OS adds pipeline engine, multi-agent orchestration, and governance.
**Consequences:** Must track upstream changes selectively. Core types must be in @opencode-ai/core to minimize fork merge conflicts.

## ADR-002: 13-Phase Pipeline Engine
**Date:** 2026-07-20 | **Status:** Accepted
**Context:** Need a structured workflow that ensures quality and completeness without blocking velocity.
**Decision:** Implement 13 sequential phases (discovery → delivery) with explicit gates. Parallel execution allowed for independent sub-tasks within phases.
**Consequences:** More up-front planning overhead but significantly reduced rework. Pipeline TODO tracks progress across all phases.

## ADR-003: 21 Specialized Agents
**Date:** 2026-07-20 | **Status:** Accepted
**Context:** Single-agent systems lack depth across multiple domains (security, UX, QA, architecture).
**Decision:** 21 specialized agents in 10 categories, orchestrated by auto agent. Each agent has a single responsibility and explicit context budget.
**Consequences:** Higher token cost per task but better quality per domain. Requires careful context compression.

## ADR-004: Context Engine with Dependency Graph
**Date:** 2026-07-20 | **Status:** Accepted
**Context:** Full-project context exceeds model context windows. Need intelligent context pruning.
**Decision:** Context engine builds a static dependency graph of the project. Agents query for targeted subgraphs rather than loading entire project.
**Consequences:** Requires initial index generation. Graph must be invalidated and regenerated when project structure changes.

## ADR-005: ADR Auto-Generation
**Date:** 2026-07-20 | **Status:** Accepted
**Context:** Developers forget to document decisions. Manual ADR writing is low priority.
**Decision:** Architect agent automatically generates ADRs during the architecture phase. Debated agents review and approve. Stored in memory/decisions.md.
**Consequences:** More ADRs than strictly necessary but ensures coverage. Auto-generated ADRs require human review before finalization.

## ADR-006: InstanceState with ScopedCache
**Date:** 2026-07-27 | **Status:** Accepted
**Context:** Services need per-project state isolation without global state leaks. Multiple open projects share the same process, and each project's services (config, session, tool registry) require their own state that is automatically cleaned up when the project is closed.
**Decision:** Use `ScopedCache.ScopedCache` keyed by directory path, with `InstanceState.make()` creating the cache and `InstanceState.get()` retrieving the per-directory entry. `ScopedCache` handles deduplication (same directory returns the cached instance) and automatic cleanup on disposal via `Effect.addFinalizer`. A disposer registry (`registerDisposer`) invalidates the cache entry when the project directory is released.
**Alternatives:**
- **Global Map with manual cleanup:** Simpler but requires explicit lifecycle management and risks memory leaks if cleanup is missed.
- **AsyncLocalStorage:** Node-native context propagation but no built-in cleanup or deduplication.
- **Class instances per project:** Manual lifecycle, no deduplication across concurrent accesses.
**Consequences:** Clean per-directory isolation, automatic cleanup, run-once semantics for initialization. However, all state access requires a directory-scoped key, and the `ScopedCache` `lookup` callback must be a pure `Effect.gen` without side conditions that vary per call.

## ADR-007: Event System (EventV2 + EventV2Bridge)
**Date:** 2026-07-27 | **Status:** Accepted
**Context:** System components (sessions, agents, file watchers, config) need to emit and subscribe to typed, observable events. Events must carry location context (directory, workspace, project) for multi-project routing, and must support durable replay for crash recovery and cross-process synchronization.
**Decision:** Use `EventV2` for schema-validated events with versioned types, aggregate IDs, and sequence numbers for durable ordering. `EventV2Bridge` wraps `EventV2` to automatically attach `Location.Info` (directory, workspaceID, project) from the active `InstanceRef` when no explicit location is provided. Events are also bridged to `GlobalBus` for non-Effect consumers and for durable sync events with versioned types.
**Alternatives:**
- **Native EventEmitter:** Simple but untyped, no durability, no location context.
- **RxJS Subjects:** Type-safe observables but no built-in schema validation or persistence.
- **Custom pub/sub:** Full control but duplicates effort already provided by EventV2.
**Consequences:** Strong typing and traceable events with directory/workspace routing. Durable events enable crash recovery and sync. However, two parallel channels (EventV2 + GlobalBus) create redundancy and complexity. GlobalBus bridge introduces a coupling to a global emitter that bypasses Effect's structured concurrency.

## ADR-008: Config Merge Strategy (10-layer)
**Date:** 2026-07-27 | **Status:** Accepted
**Context:** Configuration originates from multiple sources: global config files, project-level files, environment variables, well-known remote URLs, managed/MDM preferences, and console-hosted org settings. These must merge deterministically with a clear precedence order.
**Decision:** Implement a priority-ordered merge chain from lowest to highest precedence:
1. Well-known remote configs (`.well-known/opencode` from authenticated providers)
2. Global config files (`config.json`, `opencode.json`, `opencode.jsonc` in `Global.Path.config`)
3. Legacy `config.toml` migration (read once, merge, write as JSON)
4. `OPENCODE_CONFIG` flag file path
5. Project config files (scanned via `ConfigPaths.files`)
6. `.opencode/` directory configs (`opencode.json`/`opencode.jsonc`)
7. `.opencode/command` and `.opencode/agent` overrides
8. Managed config directory (`ConfigManaged.managedConfigDir`)
9. macOS managed preferences (`.mobileconfig` via MDM)
10. Active org console config (fetched from account service)
Each layer uses `mergeDeep` with array concatenation for `instructions`. Plugin origins are tracked per-entry for scope-sensitive decisions.
**Alternatives:**
- **Single file:** Simple but cannot support multi-source (global, project, remote, MDM) configuration.
- **DB-backed:** Adds infrastructure dependency for a concern that is fundamentally file-based.
- **Env-only:** Lacks the structure and discoverability of JSON config files.
- **CLI flags:** Good for overrides but poor for persistent, shareable configuration.
**Consequences:** Flexible multi-source configuration with clear precedence. However, merge order is critical and hard to debug — a silent precedence bug can override expected values. Environment variable injection into config values is a security risk requiring careful sanitization. The 10-layer chain adds loading latency.

## ADR-009: AppNodeBuilder / LayerNode Architecture
**Date:** 2026-07-27 | **Status:** Accepted
**Context:** The application has ~40 Effect services (config, auth, session, tools, MCP, plugins, etc.). Wiring them together with raw `Layer.mergeAll` and `Layer.provide` chains is error-prone, loses logical grouping, and makes it hard to inspect which services are available.
**Decision:** Introduce `LayerNode` as a named, inspectable node wrapping an Effect service with its layer and dependencies. `LayerNode.group()` logically groups related services (infrastructure, config/auth, session/tools, integrations, project/workspace, app/core). `AppNodeBuilderV1.build()` composes all groups into a single `Layer`. The composed layer is passed to `ManagedRuntime.make()` with a shared `memoMap` for deduplication. `AppRuntime` wraps the runtime with `attach()` for instance context injection.
**Alternatives:**
- **`Layer.mergeAll` + `Layer.provide`:** Works but loses grouping structure; all services are flat. Hard to reason about dependency order.
- **Manual DI containers:** Over-engineered for a process that creates services once at startup. Adds indirection without benefit.
- **Global singletons:** Simple but prevents testing, multi-project isolation, and lifecycle management.
**Consequences:** Simple, composable service wiring with clear logical groups. The `AppNodeBuilderV1.build` call creates a single monolithic hub file (`app-runtime.ts`) that imports all service nodes — this is a central coupling point. Adding a new service requires touching the hub file, but the `LayerNode` pattern makes each service's contribution self-contained and independently testable.

## ADR-014 — Token Economy (2026-08-10)
- Módulo puro em `packages/core/src/pipeline/token-economy.ts`, exportado via pipeline/index.ts.
- Invariante cache-safe: camadas 0 (estável) → 1 (semi-estável) → 2 (volátil); nunca volatile antes de stable; `CacheOrderViolation` throw.
- Budgets: session 1M / agent 300K / subagent 100K; thresholds compact 0.8 / finalize 0.9 / stop 1.0 (env TOKEN_ECONOMY_BUDGET_*). Semântica real: ratio >=1.0 → "stop", >=0.9 → "finalize", NaN → stop.
- Métricas atômicas em ~/.opencode/token-economy.json (tmp+rename, modo 0600, estado null-prototype, chaves sanitizadas, max 500 sessões).
- Compactação estruturada `{goal, decisions, files_changed, pending_tasks, blockers, next_step}` alinhada ao SUMMARY_TEMPLATE.
- Anti-goals v1: cache_control breakpoints, prompt_cache_key, model routing, RAG, token firewall.
- Custo default $3/M input, $15/M output, cached 0.1x (env TOKEN_ECONOMY_COST_*).
- **Status: Accepted** — implementado em 2026-08-10 (commits 28 na branch dev; feed real de tokens ligado na compactação; gate advisory `token-economy` registrado). Coletor L0/L1/L2 e formatter estruturado existem como biblioteca; integração no caminho real de build de prompt fica como trabalho futuro (docs 14.2/14.3 refletem isso).
