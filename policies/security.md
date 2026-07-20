# Security Policy

## OWASP Top 10 Awareness

Every agent MUST be aware of OWASP Top 10 (2021):

- A01: Broken Access Control
- A02: Cryptographic Failures
- A03: Injection (XSS, SQL, NoSQL, shell, LLM prompt injection)
- A04: Insecure Design
- A05: Security Misconfiguration
- A06: Vulnerable Components
- A07: Authentication Failures
- A08: Integrity Failures
- A09: Logging & Monitoring Failures
- A10: SSRF

LLM-specific: prompt injection, jailbreaking, data leakage via output.

## Secret Scanning

- No secrets in code — ever
- Environment variables for all credentials
- `.env.example` committed (with placeholder values only)
- Secret scanning enabled in CI
- If a secret is committed, rotate immediately, purge from git history

## Permission-Based Tool Access

The `agent.ts` permission model enforces:

- Read-only tools require no approval
- Write/create tools require user approval
- Destructive/delete tools require explicit user confirmation
- External network access requires approval
- File scope can be restricted per agent role

## Security Gate

Before delivery, the security reviewer MUST:

1. Scan for hardcoded secrets
2. Check dependency CVEs
3. Review auth/authorization logic
4. Validate input sanitization
5. Check for prompt injection vectors (in LLM features)
6. Confirm rate limiting on critical endpoints

If ANY of these fail → block delivery until resolved.
