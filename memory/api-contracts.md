# Engineering OS — API Contracts

## Agent Service
```
listAgents(): Promise<AgentInfo[]>
  Returns all registered agents with id, name, description, model, status
  Source: agent.ts — reads from agent config table

getAgent(id: AgentId): Promise<AgentInfo | undefined>
  Returns single agent by identifier
  Throws AgentNotFoundError if missing

getDefaultInfo(): DefaultInfo
  Returns auto agent config and pipeline status
  Synchronous — reads from in-memory state
```

## Command Service
```
listCommands(category?: string): CommandInfo[]
  Returns available CLI commands, optionally filtered by category
  Categories: pipeline, agent, context, adr, session, util

getCommand(name: string): CommandInfo | undefined
  Returns command definition with args, flags, description
```

## Context Engine
```
scanProject(path: string): Promise<ProjectGraph>
  Scans project directory, builds dependency graph
  Returns nodes (files, packages, modules) and edges (imports, references)
  Generates memory/repository-index.md

impactAnalysis(target: string): Promise<ImpactReport>
  Given a file/package/module, returns dependent nodes
  Used by architect and planner for change impact assessment

queryDependencies(scope: string[]): Promise<SubGraph>
  Returns filtered subgraph containing only requested scopes
  Used by agents to load targeted context instead of full project
```

## ADR Service
```
createAdr(title: string, context: string, decision: string, consequences: string): Promise<AdrEntry>
  Creates new ADR, auto-assigns next number, timestamps
  Appends to memory/decisions.md

listAdrs(): AdrEntry[]
  Returns all ADR entries sorted by number descending

searchAdrs(query: string): AdrEntry[]
  Full-text search across ADR titles and contexts
```

## Token Economy Service (core)
```
record(level: "agent" | "session" | "subagent", inputTokens: number, outputTokens: number, cachedRead: number, sessionKey?: string, config?: TokenEconomyConfig): void
  Feeds usage metrics; never throws; persists atomically to ~/.opencode/token-economy.json

recordCompaction(config?, sessionKey?): void
  Increments compaction counter + requests

reset(sessionKey?: string): void
  Clears metrics for a session key

checkBudget(config): { status: "ok" | "compact" | "finalize" | "stop", ratio, message }
  Watchdog: thresholds 0.8 / 0.9 / 1.0 per level; returns stop when NaN ratio detected

getMetrics(config?, sessionKey?): TokenEconomyMetrics
  total + per-session aggregates with estimated_cost / cache_hit_rate

summaryText / summarizeMessages(input): CompactedSummary
  Structured compaction aligned to SUMMARY_TEMPLATE with stable/semi-stable/volatile layers (L0/L1/L2)
```
## Token Economy Tool (opencode)
```
tokenEconomy status      → current metrics + budget status from ~/.opencode/token-economy.json
tokenEconomy compact     → force structured compaction of messages (needs working session)
```
Gate: `token-economy` (advisory, exit 0) registered in gate.ts — GateName includes "token-economy"; env `GATE_TIMEOUT_MS` overrides 120s default (600s).
