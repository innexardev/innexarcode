# Testing Policy

## Coverage Requirement

Minimum coverage: **≥80%** across all modules.

Measured by: branch coverage for logic, line coverage for data/mapping code.

Coverage gate is enforced in CI. Below 80% — block merge.

## Test Types

| Type | Scope | Tooling | Runs |
|------|-------|---------|------|
| Unit | Single function/component | Vitest/Jest/Playwright | `npm test` |
| Integration | Service + DB + API | Supertest + Testcontainers | `npm run test:integration` |
| E2E | Full user flow | Playwright | `npm run test:e2e` |

## QA Breaker

After standard QA passes, `qa-breaker` agent runs adversarial testing:

- Send invalid/malformed inputs
- Test race conditions
- Test boundary values (MAX_SAFE_INTEGER, empty strings, null, undefined)
- Attempt auth bypass
- Try XSS/SQL injection in all input fields
- Upload oversized files, wrong formats
- Simulate network failures

If anything breaks → report to developer with reproduction steps.

## Definition of Done

| Task Type | Requires |
|-----------|----------|
| Bug fix | Regression test + unit test |
| New feature | Unit + integration tests |
| API endpoint | Integration test + schema contract test |
| UI component | Component test + loading/error/empty state tests |
| Auth/permissions | Auth-specific integration test |
| Data migration | Forward + rollback tests |
| Refactor | Existing tests must pass (no coverage drop) |
