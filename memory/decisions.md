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
