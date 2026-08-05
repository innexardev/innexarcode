import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260804230001_memory_knowledge",
  up(tx) {
    return Effect.gen(function* () {
      // memory — tiered memory store (Working/ShortTerm/LongTerm/Institutional)
      yield* tx.run(`
        CREATE TABLE "memory" (
          "id" text PRIMARY KEY,
          "session_id" text,
          "workspace_id" text,
          "level" text NOT NULL CHECK("level" IN ('working','short_term','long_term','institutional')),
          "key" text NOT NULL,
          "value" text NOT NULL,
          "tags" text NOT NULL DEFAULT '[]',
          "access_count" integer NOT NULL DEFAULT 0,
          "last_accessed_at" integer,
          "created_by" text,
          "created_at" integer NOT NULL,
          "updated_at" integer NOT NULL
        );
      `)

      // knowledge — semantic knowledge base (RAG source)
      yield* tx.run(`
        CREATE TABLE "knowledge" (
          "id" text PRIMARY KEY,
          "workspace_id" text NOT NULL,
          "domain" text NOT NULL,
          "category" text NOT NULL,
          "title" text NOT NULL,
          "content" text NOT NULL,
          "content_hash" text NOT NULL,
          "source_type" text NOT NULL,
          "source_uri" text,
          "author" text,
          "confidence" real NOT NULL DEFAULT 1.0,
          "verified_at" integer,
          "verified_by" text,
          "created_at" integer NOT NULL,
          "updated_at" integer NOT NULL
        );
      `)

      // knowledge_embedding — pgvector embeddings for RAG
      yield* tx.run(`
        CREATE TABLE "knowledge_embedding" (
          "id" text PRIMARY KEY,
          "knowledge_id" text NOT NULL,
          "chunk_index" integer NOT NULL DEFAULT 0,
          "chunk_text" text NOT NULL,
          "embedding_id" text NOT NULL,
          "model" text NOT NULL,
          "token_count" integer,
          "created_at" integer NOT NULL,
          CONSTRAINT "fk_knowledge_embedding_knowledge_id_knowledge_id_fk"
            FOREIGN KEY ("knowledge_id") REFERENCES "knowledge"("id") ON DELETE CASCADE
        );
      `)

      // session_context — compacted session snapshots
      yield* tx.run(`
        CREATE TABLE "session_context" (
          "id" text PRIMARY KEY,
          "session_id" text NOT NULL,
          "workspace_id" text NOT NULL,
          "compaction_version" integer NOT NULL,
          "summary" text NOT NULL,
          "key_decisions" text NOT NULL DEFAULT '[]',
          "active_files" text NOT NULL DEFAULT '[]',
          "open_questions" text NOT NULL DEFAULT '[]',
          "agent_state" text NOT NULL DEFAULT '{}',
          "memory_refs" text NOT NULL DEFAULT '[]',
          "compacted_at" integer NOT NULL,
          "created_at" integer NOT NULL
        );
      `)

      // memory_event — append-only audit log for memory operations
      yield* tx.run(`
        CREATE TABLE "memory_event" (
          "id" text PRIMARY KEY,
          "memory_id" text NOT NULL,
          "session_id" text,
          "workspace_id" text,
          "event_type" text NOT NULL,
          "delta" text NOT NULL DEFAULT '{}',
          "timestamp" integer NOT NULL
        );
      `)

      // knowledge_event — append-only audit log for knowledge operations
      yield* tx.run(`
        CREATE TABLE "knowledge_event" (
          "id" text PRIMARY KEY,
          "knowledge_id" text NOT NULL,
          "event_type" text NOT NULL,
          "delta" text NOT NULL DEFAULT '{}',
          "timestamp" integer NOT NULL
        );
      `)

      // Indexes for memory
      yield* tx.run(`CREATE INDEX idx_memory_level ON "memory"("level");`)
      yield* tx.run(`CREATE INDEX idx_memory_session ON "memory"("session_id");`)
      yield* tx.run(`CREATE INDEX idx_memory_workspace ON "memory"("workspace_id");`)
      yield* tx.run(`CREATE INDEX idx_memory_key ON "memory"("key");`)
      yield* tx.run(`CREATE INDEX idx_memory_access ON "memory"("last_accessed_at");`)

      // Indexes for knowledge
      yield* tx.run(`CREATE INDEX idx_knowledge_workspace ON "knowledge"("workspace_id");`)
      yield* tx.run(`CREATE INDEX idx_knowledge_domain ON "knowledge"("domain");`)
      yield* tx.run(`CREATE INDEX idx_knowledge_category ON "knowledge"("category");`)
      yield* tx.run(`CREATE INDEX idx_knowledge_hash ON "knowledge"("content_hash");`)

      // Indexes for embeddings
      yield* tx.run(`CREATE INDEX idx_embedding_knowledge ON "knowledge_embedding"("knowledge_id");`)
      yield* tx.run(`CREATE INDEX idx_embedding_model ON "knowledge_embedding"("model");`)

      // Indexes for session context
      yield* tx.run(`CREATE UNIQUE INDEX idx_session_context_session ON "session_context"("session_id");`)
      yield* tx.run(`CREATE INDEX idx_session_context_workspace ON "session_context"("workspace_id");`)

      // Indexes for audit events
      yield* tx.run(`CREATE INDEX idx_memory_event_memory ON "memory_event"("memory_id");`)
      yield* tx.run(`CREATE INDEX idx_memory_event_session ON "memory_event"("session_id");`)
      yield* tx.run(`CREATE INDEX idx_knowledge_event_knowledge ON "knowledge_event"("knowledge_id");`)
    })
  },
} satisfies DatabaseMigration.Migration
