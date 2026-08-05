import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260804230000_pipeline_engine",
  up(tx) {
    return Effect.gen(function* () {
      // pipeline table — defines pipeline schemas (engineering, seo, etc.)
      yield* tx.run(`
        CREATE TABLE "pipeline" (
          "id" text PRIMARY KEY,
          "project_id" text NOT NULL,
          "name" text NOT NULL,
          "version" integer NOT NULL DEFAULT 1,
          "stages" text NOT NULL,
          "time_created" integer NOT NULL,
          "time_updated" integer NOT NULL
        );
      `)

      // pipeline_run — instance of a pipeline execution
      yield* tx.run(`
        CREATE TABLE "pipeline_run" (
          "id" text PRIMARY KEY,
          "pipeline_id" text NOT NULL,
          "project_id" text NOT NULL,
          "status" text NOT NULL DEFAULT 'pending',
          "current_stage" text,
          "context" text NOT NULL DEFAULT '{}',
          "started_at" integer NOT NULL,
          "finished_at" integer
        );
      `)

      // pipeline_stage — execution stage within a run
      yield* tx.run(`
        CREATE TABLE "pipeline_stage" (
          "id" text PRIMARY KEY,
          "pipeline_run_id" text NOT NULL,
          "name" text NOT NULL,
          "status" text NOT NULL DEFAULT 'pending',
          "output" text NOT NULL DEFAULT '{}',
          "started_at" integer,
          "finished_at" integer,
          "agent_id" text,
          "time_created" integer NOT NULL,
          "time_updated" integer NOT NULL,
          CONSTRAINT "fk_pipeline_stage_pipeline_run_id_pipeline_run_id_fk"
            FOREIGN KEY ("pipeline_run_id") REFERENCES "pipeline_run"("id") ON DELETE CASCADE
        );
      `)

      // pipeline_task — work item within a stage
      yield* tx.run(`
        CREATE TABLE "pipeline_task" (
          "id" text PRIMARY KEY,
          "pipeline_stage_id" text NOT NULL,
          "name" text NOT NULL,
          "status" text NOT NULL DEFAULT 'pending',
          "result" text NOT NULL DEFAULT '{}',
          "time_created" integer NOT NULL,
          "time_updated" integer NOT NULL,
          CONSTRAINT "fk_pipeline_task_pipeline_stage_id_pipeline_stage_id_fk"
            FOREIGN KEY ("pipeline_stage_id") REFERENCES "pipeline_stage"("id") ON DELETE CASCADE
        );
      `)

      // pipeline_gate — quality gate within a stage
      yield* tx.run(`
        CREATE TABLE "pipeline_gate" (
          "id" text PRIMARY KEY,
          "pipeline_stage_id" text NOT NULL,
          "name" text NOT NULL,
          "status" text NOT NULL DEFAULT 'pending',
          "output" text NOT NULL DEFAULT '',
          "duration_ms" integer,
          "passed_at" integer,
          "time_created" integer NOT NULL,
          "time_updated" integer NOT NULL,
          CONSTRAINT "fk_pipeline_gate_pipeline_stage_id_pipeline_stage_id_fk"
            FOREIGN KEY ("pipeline_stage_id") REFERENCES "pipeline_stage"("id") ON DELETE CASCADE
        );
      `)

      // pipeline_event — audit trail
      yield* tx.run(`
        CREATE TABLE "pipeline_event" (
          "id" text PRIMARY KEY,
          "pipeline_run_id" text NOT NULL,
          "stage" text,
          "task" text,
          "event_type" text NOT NULL,
          "data" text NOT NULL DEFAULT '{}',
          "timestamp" integer NOT NULL,
          CONSTRAINT "fk_pipeline_event_pipeline_run_id_pipeline_run_id_fk"
            FOREIGN KEY ("pipeline_run_id") REFERENCES "pipeline_run"("id") ON DELETE CASCADE
        );
      `)

      // Indexes for performance
      yield* tx.run(`CREATE INDEX idx_pipeline_run_status ON "pipeline_run"("status");`)
      yield* tx.run(`CREATE INDEX idx_pipeline_run_project ON "pipeline_run"("pipeline_id", "status");`)
      yield* tx.run(`CREATE INDEX idx_pipeline_stage_run ON "pipeline_stage"("pipeline_run_id");`)
      yield* tx.run(`CREATE INDEX idx_pipeline_task_stage ON "pipeline_task"("pipeline_stage_id");`)
      yield* tx.run(`CREATE INDEX idx_pipeline_gate_stage ON "pipeline_gate"("pipeline_stage_id");`)
      yield* tx.run(`CREATE INDEX idx_pipeline_event_run ON "pipeline_event"("pipeline_run_id");`)
    })
  },
} satisfies DatabaseMigration.Migration
