# Engineering OS — Database Schema

## Session Table (opencode fork)
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PRIMARY KEY | Session UUID |
| created_at | TEXT (ISO 8601) | Session creation timestamp |
| updated_at | TEXT (ISO 8601) | Last activity timestamp |
| config | TEXT (JSON) | Session configuration blob |
| metadata | TEXT (JSON) | Extended metadata |

## Message Table
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PRIMARY KEY AUTOINCREMENT | Sequential message ID |
| session_id | TEXT | FK to session.id |
| role | TEXT | 'user', 'assistant', 'system', 'tool' |
| content | TEXT | Message content / tool result |
| tool_calls | TEXT (JSON) | Tool invocation data |
| created_at | TEXT (ISO 8601) | Message timestamp |

## Agent Config Table
| Column | Type | Description |
|--------|------|-------------|
| agent_id | TEXT PRIMARY KEY | Agent identifier |
| name | TEXT | Display name |
| description | TEXT | Agent purpose/role |
| model | TEXT | AI model assignment |
| config | TEXT (JSON) | Agent-specific settings |
| enabled | INTEGER (BOOLEAN) | 1 = active, 0 = disabled |

## Pipeline TODO Items
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PRIMARY KEY | Item UUID |
| session_id | TEXT | FK to session.id |
| module | TEXT | Module name (backend, frontend, infra, qa, docs) |
| content | TEXT | Task description |
| status | TEXT | pending, in_progress, completed, cancelled, blocked |
| priority | TEXT | high, medium, low |
| phase | TEXT | Current pipeline phase |
| created_at | TEXT (ISO 8601) | Creation timestamp |
| updated_at | TEXT (ISO 8601) | Last update timestamp |

## Indexes
- idx_messages_session: messages(session_id, created_at)
- idx_todo_session: pipeline_todo(session_id, module, status)
- idx_todo_phase: pipeline_todo(phase, status)
