# Engineering OS — Architecture

## Layering
Engineering OS is a layered platform on top of an opencode fork. opencode provides the CLI shell, tool execution, and agent scaffolding; Engineering OS adds the pipeline engine, multi-agent orchestration, and governance layers.

## TUI Layout
3-panel layout: left panel (22%) — file tree + project status; center panel (flex) — chat + agent output; right panel (18%) — session management, TODO view, quick commands.

## Pipeline Engine
13-phase pipeline: discovery → research → planning → architecture → debate → implementation → review → QA → security → self-critique → question → audit → delivery. Each phase has an explicit gate that must pass before the next phase begins.

## Agent Architecture
21 specialized agents orchestrated by the auto agent. Auto never implements — it selects the right agent(s) for the task, delegates via task tool, and synthesizes results. Agents are grouped into Execution, Implementation, Quality, Security, UX/Design, Performance, Refactoring, Documentation, Management, and Consulting roles.

## Dependency Inversion
Core types (Pipeline, Agent, Gate, Context) live in @opencode-ai/core. Implementation packages (cli, agents, pipeline, tui) depend on core. No circular cross-package dependencies.

## Autonomous Engineering (2026-08-05)

- **BacklogEngine** — RICE priority (reach × impact × confidence ÷ effort), persisted to `~/.opencode/backlog.json`.
- **ObservabilityEngine** — dedupe window 1h, error events auto-create backlog bugs, persisted to `~/.opencode/observability.json`.
- **LoopEngine** — maxIterations default 3, escalates after 2 consecutive failures, persisted to `~/.opencode/loop-state.json`.
- **PipelineTemplates** — project types: web, data, infra, product, mobile, api; phases reference the canonical agent roster (validate() checks against KNOWN_AGENTS).
- **Workflow** — `getState`/`decide` now implemented; `state` gained `reload()`.
- **Tools** — 9 new tools registered: backlog-add, backlog-next, backlog-list, backlog-claim, backlog-complete, backlog-cancel, observability-record, template-start, loop-run.
