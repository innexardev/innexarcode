# UX Policy

## Responsive TUI Panels

All terminal UIs must be responsive to terminal resize:

- 3-panel layout collapses to 2-panel on small terminals (<120 cols)
- Single-panel fallback on very narrow terminals (<80 cols)
- Panel widths auto-scale proportionally
- Content truncation with ellipsis on overflow (no broken layout)

## Agent Status Visibility

Every agent's status must be visible at all times:

```
┌─────────────────────────────────────────────────────────┐
│ Backend ██████████░░ 72%  │ QA ██░░░░░░░░░░ 18%        │
│ Frontend ██████░░░░░░ 43%  │ Security ░░░░░░░░░░  0%    │
└─────────────────────────────────────────────────────────┘
```

- Phase transitions logged with timestamp
- Error states highlighted with color (red foreground)
- Idle agents shown as dimmed

## Pipeline Visualization

Pipeline phases displayed as a progress indicator:

```
Discovery ✓ → Research ✓ → Planning ✓ → Architecture ✓ → Debate □ → ...
```

- Checkmark for completed phases
- Arrow for current phase
- Dimmed for future phases
- Hover/click expands phase details

## Mission Control Dashboard

A dashboard view (`tui-dashboard`) provides:

- Project overview (name, status, last action)
- Per-module progress bars
- Recent activity log (last 10 actions with timestamps)
- Quality gate status (green/yellow/red per gate)
- Quick action buttons (run phase, open plan, jump to file)
