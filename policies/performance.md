# Performance Policy

## Bundle Size Awareness

- Monitor bundle size changes per PR
- Alert if change exceeds ±5% or 10KB
- Target: initial JS < 150KB gzip, initial CSS < 30KB gzip
- Use bundle analyzer in CI pipeline
- Tree-shaking must be verified for every new dependency

## Lazy Loading

Apply lazy loading to:

- Route/page components (dynamic import)
- Heavy third-party libraries (load on interaction, not on mount)
- Images below the fold (native lazy loading)
- Charts/data visualizations (load after main content paints)
- Heavy computations (defer to Web Worker or idle callback)

Exception: core navigation and above-the-fold content.

## Context Optimization

Never send 250 files to an agent. The Context Engine reduces context to:

- Architecture Summary — high-level structure and module responsibilities
- API Summary — endpoints, contracts, auth model
- DB Summary — schema, relationships, indexes
- Dependency Summary — relevant dependency graph
- Changed files — only files touched by the current task

Target context: ≤20 files per task, ≤5000 lines of relevant code.

## Monitoring

- Bundle size tracked per commit
- API response times (p50/p95/p99)
- Memory usage trends per session
- Compile/build time tracked (alert on >30s regression)
- Lint time tracked (alert on >10s regression)
