import { homedir } from "node:os"
import {
  PipelineStateMachine,
  PHASE_ORDER,
  PHASE_LABELS,
  PHASE_GATES,
  PHASE_AGENT,
  createInitialStatus,
  statusFromJson,
  type Phase,
  type PipelineStatus,
} from "./state"
import * as Backlog from "./backlog"
import * as Loop from "./loop"
import * as Observability from "./observability"
import * as Templates from "./templates"
import * as Todo from "./todo"
import * as Workflow from "./workflow"
import * as Dispatcher from "./dispatcher"
import * as MergeCoordinator from "./merge-coordinator"
import * as WorkspaceIsolation from "./workspace-isolation"
import * as Certification from "./certify"

const persistPath =
  process.env.PIPELINE_STATE_PATH ?? `${homedir()}/.opencode/pipeline-state.json`

export const pipelineState = await PipelineStateMachine.load(persistPath)
// NOTE: singleton reloads on module re-eval (tsgo dev)

export async function reloadPipelineState(): Promise<PipelineStatus> {
  return await pipelineState.reload()
}

export { PipelineStateMachine, createInitialStatus, statusFromJson, Backlog, Loop, Observability, Templates, Todo, Workflow, Dispatcher, MergeCoordinator, WorkspaceIsolation, Certification }
export { PHASE_ORDER, PHASE_LABELS, PHASE_GATES, PHASE_AGENT }
export type { Phase, PipelineStatus }
