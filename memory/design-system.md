# Engineering OS — Design System

## Color Tokens (Agent Type Mapping)
- **Execution** (auto, planner, architect): `#3B82F6` (blue)
- **Implementation** (backend, frontend, db agents): `#10B981` (green)
- **Quality** (qa, qa-breaker, code-reviewer, questionador): `#F59E0B` (amber)
- **Security** (security, auditor, a11y): `#EF4444` (red)
- **UX/Design** (ux-reviewer, design-critic): `#8B5CF6` (purple)
- **Performance**: `#EC4899` (pink)
- **Refactoring**: `#06B6D4` (cyan)
- **Documentation**: `#6366F1` (indigo)
- **Management** (release-manager, po): `#F97316` (orange)
- **Consulting** (ceo, cto, teacher, mentor): `#14B8A6` (teal)

## Panel Layout
- Left panel: 22% width — file tree + project status
- Center panel: flex (1) — chat + agent output + streaming
- Right panel: 18% width — session management, TODO, quick commands
- Gaps between panels: 2px border with `#1e1e2e`

## Pipeline Phase Icons
- `✓` (green) — completed phase
- `●` (blue) — current phase
- `○` (dim) — pending phase
- `✗` (red) — failed phase
- `⚠` (amber) — phase with waived gate

## Components
- AgentDashboard: progress bars per module (backend, frontend, infra, QA, docs) with percentage and label
- PhaseIndicator: pipeline phase strip with icons and labels
- StatusLine: current pipeline phase + message at bottom of TUI
- Panel: boxed container with title, optional border color per agent type

## Typography
- Monospace for code and terminal output (JetBrains Mono, 14px)
- Sans-serif for UI labels and descriptions (Inter, 13px)
- Phase headers: bold + uppercase tracking
- Agent names: bold with agent-type color
