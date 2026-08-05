# Engineering OS — Q4 2026 Architecture Specification

## Status: DRAFT

---

## 1. Executive Summary

**Goal:** Transform the Engineering OS from a manual pipeline executor into a fully autonomous, self-improving engineering intelligence system.

**What exists (85%):**
- Pipeline state machine (13 phases, gates, listeners)
- Event sourcing system (event.ts, 638 lines, Pub/Sub, durable events, aggregate replay)
- Session compaction (auto-summarization with structured templates)
- Context engine (dependency graph, BFS, impact analysis, knowledge base)
- Mission system (auto-detection of project type, priority scoring)
- System context (registry of context providers)
- Cache layers (models, repository, NPM, skills)
- Agent registry

**What is missing (15% but critical):**
- **Memory persistence** — sessions start from scratch, no learning from past decisions
- **RAG / Vector search** — no semantic code search, no context from historical decisions
- **Workflow engine** — mission detects type but doesn't auto-execute pipeline

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Engineering OS                          │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Mission  │→ │Pipeline  │→ │ Workflow  │              │
│  │ Detector │  │ Engine   │  │ Engine    │              │
│  └──────────┘  └──────────┘  └──────────┘              │
│       ↓              ↓              ↓                        │
│  ┌──────────────────────────────────────────┐             │
│  │         Agent Orchestrator               │             │
│  │  Architect · Backend · Frontend · QA    │             │
│  │  Security · Performance · Database       │             │
│  └──────────────────────────────────────────┘             │
│       ↓              ↓              ↓                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │  Memory   │  │   RAG    │  │  Events  │              │
│  │  System   │  │  Engine  │  │  Store   │              │
│  └──────────┘  └──────────┘  └──────────┘              │
│       ↓              ↓              ↓                        │
│  ┌──────────────────────────────────────────┐             │
│  │         PostgreSQL + pgvector            │             │
│  └──────────────────────────────────────────┘             │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Data Model

### 3.1 Core Entities

```
Workspace (tenant isolation)
  └── Project
        └── PipelineRun        ← instance of a pipeline execution
              └── PipelineStage   ← discovery, research, planning...
                    └── PipelineTask  ← specific work items
                          └── PipelineGate  ← build, test, lint...
                                └── PipelineEvent  ← audit trail
```

### 3.2 Database Schema

#### Table: `pipeline`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | PK |
| project_id | uuid | FK → project |
| name | text | Pipeline name (e.g. "engineering", "seo", "data") |
| version | int | Schema version (v1, v2, v3) |
| stages | jsonb | Stage definitions |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### Table: `pipeline_run`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | PK |
| pipeline_id | uuid | FK → pipeline |
| status | text | running, completed, failed, interrupted |
| current_stage | text | |
| context | jsonb | Full execution context |
| started_at | timestamptz | |
| finished_at | timestamptz | |

#### Table: `pipeline_stage`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | PK |
| pipeline_run_id | uuid | FK → pipeline_run |
| name | text | Stage name |
| status | text | pending, running, completed, failed, skipped |
| output | jsonb | Stage result, artifacts |
| started_at | timestamptz | |
| finished_at | timestamptz | |
| agent_id | text | Which agent executed this |

#### Table: `pipeline_task`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | PK |
| pipeline_stage_id | uuid | FK → pipeline_stage |
| name | text | Task name |
| status | text | pending, running, completed, failed |
| result | jsonb | Task result |

#### Table: `pipeline_gate`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | PK |
| pipeline_stage_id | uuid | FK → pipeline_stage |
| name | text | Gate name (build, test, lint...) |
| status | text | pending, passed, failed |
| output | text | Command output |
| duration_ms | int | |
| passed_at | timestamptz | |

#### Table: `pipeline_event`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | PK |
| pipeline_run_id | uuid | FK → pipeline_run |
| stage | text | Stage name |
| task | text | Task name |
| event_type | text | started, completed, failed, gate_passed, gate_failed |
| data | jsonb | Event payload |
| timestamp | timestamptz | |

#### Table: `memory`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | PK |
| project_id | uuid | FK → project |
| scope | text | short, project, org, global |
| key | text | Memory key |
| value | text | Memory value |
| embedding | vector(1536) | pgvector |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### Table: `knowledge`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | PK |
| project_id | uuid | FK → project |
| type | text | decision, pattern, api, architecture |
| title | text | |
| content | text | |
| embedding | vector(1536) | pgvector |
| source | text | File or session reference |
| created_at | timestamptz | |

### 3.3 Indexes

```sql
CREATE INDEX idx_pipeline_run_status ON pipeline_run(status);
CREATE INDEX idx_pipeline_run_project ON pipeline_run(pipeline_id, status);
CREATE INDEX idx_memory_project_scope ON memory(project_id, scope);
CREATE INDEX idx_memory_embedding ON memory USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_knowledge_embedding ON knowledge USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_knowledge_project ON knowledge(project_id, type);
```

---

## 4. Memory System

### 4.1 Four Levels

| Level | Scope | TTL | Content |
|-------|-------|-----|---------|
| **short** | session | end of session | Last N messages, current context |
| **project** | project | 90 days | Project facts, decisions, patterns |
| **org** | workspace | forever | Organization knowledge, shared patterns |
| **global** | system | forever | Language idioms, framework best practices |

### 4.2 Memory Operations

```typescript
// Memory.Service
class Memory {
  // Short-term: auto-populated from session compaction
  short(): MemoryStore    // in-memory, session-scoped

  // Project: persisted, per-project
  project(projectId: string): Promise<MemoryStore>

  // Organization: persisted, tenant-wide
  org(workspaceId: string): Promise<MemoryStore>

  // Global: persisted, system-wide
  global(): Promise<MemoryStore>

  // Search across all levels
  search(query: string, scope?: MemoryScope[]): Promise<MemoryEntry[]>

  // Promote to higher level
  promote(entry: MemoryEntry, from: MemoryScope, to: MemoryScope): Promise<void>
}

class MemoryStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  list(prefix?: string): Promise<string[]>
  search(query: string, limit?: number): Promise<MemoryEntry[]>
}
```

### 4.3 Memory Events

- `memory.created` — new memory entry
- `memory.updated` — memory modified
- `memory.promoted` — promoted to higher scope
- `memory.search` — search performed

---

## 5. RAG Engine

### 5.1 Embedding Pipeline

```
Code Change / Decision
       ↓
  Chunking (by file, function, class)
       ↓
  Embedding (via AI Provider, e.g. OpenAI text-embedding-3)
       ↓
  Store in pgvector (memory table)
       ↓
  Available for semantic search
```

### 5.2 Chunking Strategy

| Content Type | Chunk Strategy |
|-------------|---------------|
| Code files | By function/class (tree-sitter) |
| API docs | By endpoint |
| Commits | By commit message + diff |
| Decisions | By decision (ADR format) |
| Messages | By message + thread context |

### 5.3 RAG Service

```typescript
class RAGEngine {
  // Index content
  index(content: IndexableContent): Promise<void>
  indexBatch(contents: IndexableContent[]): Promise<void>

  // Search
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>

  // Retrieve and rerank
  retrieve(query: string, limit?: number): Promise<ScoredChunk[]>

  // Remove stale content
  gc(projectId: string): Promise<number>  // returns removed count
}

interface SearchOptions {
  projectId?: string      // filter by project
  scope?: MemoryScope[]   // search specific scopes
  limit?: number         // max results
  threshold?: number      // similarity threshold
  rerank?: boolean       // enable reranking
}
```

### 5.4 AI Provider Integration

```typescript
// Uses existing AIProvider from core
class EmbeddingProvider {
  constructor(private provider: AIProvider)

  embed(text: string): Promise<number[]>
  embedBatch(texts: string[]): Promise<number[][]>
}
```

---

## 6. Workflow Engine

### 6.1 Architecture

```
Mission Detection
       ↓
 Pipeline Selector (matches mission type to pipeline)
       ↓
  Workflow Engine
    ├── Stage Executor
    │     ├── Task Scheduler
    │     ├── Gate Runner
    │     └── Decision Engine ← AI-driven
    ├── Event Publisher
    ├── State Persister
    └── Agent Spawner
       ↓
  Agent Orchestrator
    ├── Architect Agent
    ├── Backend Agent
    ├── Frontend Agent
    ├── QA Agent
    ├── Security Agent
    └── ... (specialized agents)
       ↓
  Memory + RAG (context enrichment)
```

### 6.2 Workflow Definition Schema

```typescript
interface Pipeline {
  id: string
  name: string
  version: number
  stages: Stage[]
}

interface Stage {
  name: string
  agent?: AgentType       // which agent runs this
  tasks?: Task[]           // sequential tasks
  gates?: Gate[]           // quality gates
  decisions?: Decision[]   // AI-driven branch points
  on: {
    complete?: string     // next stage on complete
    fail?: string        // next stage on fail
    gate_failed?: string // next stage if gate fails
  }
}

interface Task {
  id: string
  name: string
  tool?: string           // tool to use
  prompt?: string         // override prompt
  retry?: RetryPolicy
}

interface Gate {
  name: string            // build, test, lint...
  command: string         // actual command to run
  timeout?: number
  retry?: RetryPolicy
}

interface Decision {
  name: string
  prompt: string          // AI prompt to make decision
  criteria: string[]       // success criteria
  actions: {
    continue?: string    // next stage
    retry?: string       // retry stage
    escalate?: string     // escalate to human
    rollback?: string     // rollback
  }
}

type AgentType =
  | "architect"
  | "backend"
  | "frontend"
  | "qa"
  | "security"
  | "performance"
  | "database"
  | "devops"
  | "ux"
  | "reviewer"
  | "general"
```

### 6.3 Built-in Pipelines

```typescript
const ENGINEERING_PIPELINE: Pipeline = {
  id: "engineering",
  name: "Engineering Pipeline",
  version: 1,
  stages: [
    { name: "discovery", agent: "explore", tasks: [...], on: { complete: "research" } },
    { name: "research", agent: "general", tasks: [...], on: { complete: "planning" } },
    { name: "planning", agent: "planner", tasks: [...], on: { complete: "architecture" } },
    { name: "architecture", agent: "architect", tasks: [...], on: { complete: "debate" } },
    { name: "debate", agent: "general", tasks: [...], on: { complete: "implementation" } },
    { name: "implementation", agent: "general", tasks: [...],
      gates: [{ name: "build", command: "bun run build" }, { name: "lint", command: "bun run lint" }],
      on: { complete: "review" }
    },
    { name: "review", agent: "code-reviewer", tasks: [...],
      gates: [{ name: "lint", command: "bun run lint" }, { name: "types", command: "bun typecheck" }],
      on: { complete: "qa" }
    },
    { name: "qa", agent: "qa", tasks: [...],
      gates: [{ name: "build", command: "bun run build" }, { name: "types", command: "bun typecheck" }, { name: "tests", command: "bun test" }],
      on: { complete: "security" }
    },
    { name: "security", agent: "security", tasks: [...],
      gates: [{ name: "build", command: "bun run build" }, { name: "tests", command: "bun test" }],
      on: { complete: "self-critique" }
    },
    { name: "self-critique", agent: "auditor", tasks: [...], on: { complete: "question" } },
    { name: "question", agent: "questionador", tasks: [...], on: { complete: "audit" } },
    { name: "audit", agent: "auditor", tasks: [...], on: { complete: "delivery" } },
    { name: "delivery", agent: "release-manager", tasks: [...], on: { complete: null } },
  ]
}
```

### 6.4 Workflow Engine Service

```typescript
class WorkflowEngine {
  constructor(
    private db: Database,
    private events: EventStore,
    private memory: Memory,
    private rag: RAGEngine,
    private agents: AgentRegistry,
  ) {}

  // Start a new pipeline run
  async run(pipelineId: string, projectId: string, input?: unknown): Promise<PipelineRun>

  // Resume an interrupted run
  async resume(runId: string): Promise<PipelineRun>

  // Cancel a running pipeline
  async cancel(runId: string): Promise<void>

  // Get current state
  async getState(runId: string): Promise<PipelineRun>

  // Replay from a specific stage
  async replay(runId: string, fromStage: string): Promise<PipelineRun>

  // Time travel: get state at a past timestamp
  async atTime(runId: string, timestamp: Date): Promise<PipelineRun>
}
```

### 6.5 Decision Engine

Each decision point uses AI to evaluate:

```typescript
async function makeDecision(
  stage: Stage,
  context: PipelineContext,
  pastDecisions: Decision[],
): Promise<DecisionResult> {
  const prompt = buildDecisionPrompt(stage, context, pastDecisions)
  const response = await ai.complete(prompt)
  return parseDecisionResponse(response)
}
```

**Decision types:**
- **continue** — proceed to next stage
- **retry** — repeat current stage with adjustments
- **escalate** — pause and request human input
- **rollback** — revert changes and abort

---

## 7. Agent System

### 7.1 Agent Types

| Agent | Role | Memory Scope | Tools |
|-------|------|--------------|-------|
| **architect** | System design | project+org | read, grep, plan |
| **backend** | Server code | project | edit, write, shell, read |
| **frontend** | UI code | project | edit, write, shell, read |
| **qa** | Testing | project | edit, write, shell, test |
| **security** | Security audit | project+global | scan, grep, shell |
| **performance** | Profiling | project | analyze, benchmark |
| **database** | DB design | project+org | read, schema |
| **devops** | Infra/deploy | project+org | shell, docker, k8s |
| **ux** | Design/UX | org | review, suggest |
| **reviewer** | Code review | project | read, grep, comment |
| **general** | Orchestrator | all | all tools |

### 7.2 Agent Communication

```
Architect Agent
    ↓ decision
Backend Agent ←→ Frontend Agent
    ↓              ↓
   QA Agent ←→ Security Agent
```

**Protocol:** Events via EventStore (not direct messaging)

### 7.3 Agent Memory

Each agent maintains its own memory:

```typescript
interface AgentMemory {
  agentType: AgentType
  projectId: string
  decisions: Decision[]        // what it decided and why
  patterns: Pattern[]         // code patterns it used
  preferences: Preferences   // temperature, model, etc.
}
```

---

## 8. Hotfix: Gate Deadlock Correction

**Immediate fix (before Q4):**

The gate tool executes commands but never calls `stateMachine.passGate(gate)`.

**File:** `packages/opencode/src/tool/gate.ts`

**Fix:** After `runGate()` succeeds, call the shared pipeline state:

```typescript
// After line ~115 in gate.ts
const result = yield* runGate(gate)
if (result.passed) {
  pipelineState.passGate(gate)
}
return { title, output: JSON.stringify(result), metadata: { gates: [result] } }
```

**Also fix:** `pipeline-advance.ts` creates a new `PipelineStateMachine()` on every call (line 6). Must use the shared singleton from `@opencode-ai/core/pipeline`.

---

## 9. Implementation Phases

### Phase 1: Foundation (Weeks 1-3)
- [ ] Database migrations for all new tables
- [ ] Workflow engine core (execute, resume, cancel)
- [ ] Pipeline state machine → PostgreSQL persistence
- [ ] Event store integration with pipeline_run

### Phase 2: Memory + RAG (Weeks 4-6)
- [ ] Memory system (4 scopes)
- [ ] Embedding pipeline
- [ ] pgvector integration
- [ ] RAG search service

### Phase 3: Agents (Weeks 7-9)
- [ ] Agent spawn system
- [ ] Agent orchestration
- [ ] Decision engine
- [ ] Agent memory per-type

### Phase 4: Polish (Weeks 10-12)
- [ ] Replay / time travel
- [ ] Auto-recovery
- [ ] Telemetry dashboard
- [ ] Pipeline builder UI

---

## 10. Telemetry

| Metric | Description |
|--------|-------------|
| `pipeline.duration` | Total pipeline duration |
| `stage.duration` | Per-stage duration |
| `gate.duration` | Per-gate duration |
| `gate.failures` | Gate failure count |
| `tokens.used` | Total tokens per run |
| `cost.estimated` | Estimated cost per run |
| `decisions.count` | AI decisions made |
| `memory.hits` | Memory search hits |
| `rag.hits` | RAG search hits |

---

## 11. Open Questions

1. **pgvector extension** — requires PostgreSQL superuser or managed PG. Alternative: Qdrant sidecar if PG unavailable.
2. **Multi-tenant isolation** — memory and knowledge must be strictly isolated per workspace
3. **Human escalation** — what does escalation UI look like?
4. **Cost attribution** — how to track cost per project/team?
5. **Pipeline versioning** — how to handle migration from v1 to v2?

---

## 12. Success Metrics

| Metric | Target |
|--------|--------|
| Pipeline completion rate | > 90% |
| Gate pass rate | > 85% first attempt |
| Memory retrieval hit rate | > 70% |
| RAG context relevance | > 80% (by human eval) |
| Auto-recovery success | > 95% |
| Agent decision accuracy | > 85% (vs human judgment) |
