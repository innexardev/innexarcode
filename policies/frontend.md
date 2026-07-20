# Frontend Policy

## Agent Delegation

Frontend work MUST involve:

- **ux-reviewer**: Validates flows, information architecture, cognitive load
- **design-critic**: Validates visual design, spacing, typography, color, consistency

Both must sign off before frontend code is merged.

## 3-Panel TUI Layout

```
┌──────────┬─────────────────────┬──────────┐
│ 📁 Files │ 🧠 OpenCode Chat    │ 📜 Ctrl  │
│ (tree)   │                     │ Sessions │
│ Ctrl+R   │                     │ TODO     │
│ refresh  │                     │ QuickCmd │
└──────────┴─────────────────────┴──────────┘
```

## Component States

Every component MUST handle all states:

- **Loading** — skeleton/spinner while data fetches
- **Error** — user-friendly message with retry action
- **Empty** — helpful empty state with CTA (no raw "no data")
- **Success** — normal rendered content

## Component Guidelines

- Single responsibility per component
- Props typed with TypeScript interfaces
- No style-in-JS — use Tailwind utility classes
- Prefer composition over inheritance
- Memoize expensive computations
- Accessible by default (aria, keyboard nav, focus management)
- Test loading/error/empty states for every data-driven component
