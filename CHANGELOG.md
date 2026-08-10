# Changelog

## Unreleased

### Added
- Senior-level quality gates (docs/melhorias-nivel-senior.md):
  - `polish` — Definition of Done before Delivery (TODO/console.log/secrets in diff, docs updated)
  - `a11y` — WCAG 2.1 AA scan for web/mobile templates (axe-core/pa11y)
  - `licenses` — copyleft check on new dependencies (blocks GPL/AGPL/SSPL)
  - `compat` — breaking API/schema changes require an ADR before Delivery
  - `scope` — anti scope-creep: diff must stay within `.opencode/scope.json`
  - `i18n` — translation readiness for frontend (WARN when UI files added without i18n lib)
  - `seo` — meta tags (title/description/OG) required on new pages, sitemap/robots WARN
  - `market` — conditional demand validation: user-facing features without registered demand get WARN
  - `infra-cost` — IaC changes trigger infracost estimate (WARN if not installed)
  - `onboarding` — new client-facing pages must declare onboarding needs (features.json/onboarding.md/inline)
  - `analytics` — new client-facing pages must declare tracking events (analytics.json/analytics.md/track calls)
- `dispatcher-route` tool — routes specialist agents by diff file type, goal keywords and project template; computes safe parallel partitions by top-level directory
- Specialist registry: frontend, backend, database, infra, security, mobile, data, qa-test, design-system, ux-writing, support
- `polish` is now a required gate for the Delivery phase in PHASE_GATES and all templates
- New `tech-lead` review subphase (cto persona) in every template's Review phase
- Scripts: `packages/opencode/script/gates/{polish,a11y,licenses,compat,scope,i18n,seo,market,infra-cost}.ts`

## 1.22.0 — 2026-08-10

### Added
- Autonomous engineering modules: backlog (RICE + TTL claim), observability (dedupe + audit), loop engine, templates, workflow, state checkpoints/risks
- 9 pipeline tools: backlog-add/next/list/claim/complete/cancel, observability-record, template-start, loop-run
- Build.ts `--os` flag for cross-compilation; npm publish pipeline; CI macOS matrix; smoke test; semantic-release; unpublish-orphan script

### Changed
- Rebrand to iNNEXARCode: logos, wordmark, launcher title, update messages
- Version fetch now tracks `opencode-engos-ai` on npm instead of `opencode-ai`
- Postinstall rewritten: global installs, sibling node_modules, baseline fallback for non-AVX2, Windows `allow-scripts` support