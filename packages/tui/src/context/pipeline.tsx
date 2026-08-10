import { createSignal, onCleanup } from "solid-js"
import { createSimpleContext } from "./helper"
import { homedir } from "node:os"
import path from "path"

export interface PipelineFileStatus {
  currentPhase: string | null
  currentSubphase: string | null
  completedPhases: string[]
  failedPhases: { phase: string; error: string }[]
  gatesPassed: Record<string, boolean>
  workspace?: string
  updatedAt: number
}

const POLL_MS = 2_000

export const { use: usePipeline, provider: PipelineProvider } = createSimpleContext({
  name: "Pipeline",
  init: () => {
    // Mesmo caminho do PipelineStateMachine (packages/core/src/pipeline/index.ts)
    const file =
      process.env.PIPELINE_STATE_PATH ??
      path.join(homedir(), ".opencode", "pipeline-state.json")
    const [status, setStatus] = createSignal<PipelineFileStatus | null>(null)
    const [ready, setReady] = createSignal(false)

    let timer: ReturnType<typeof setInterval> | undefined
    let disposed = false

    async function poll() {
      try {
        const res = await fetch(`file://${file}`)
        if (!res.ok) {
          if (!disposed) setStatus(null)
          return
        }
        const data = (await res.json()) as PipelineFileStatus
        if (!disposed) setStatus(data)
      } catch {
        if (!disposed) setStatus(null)
      } finally {
        if (!disposed) setReady(true)
      }
    }

    void poll()
    timer = setInterval(poll, POLL_MS)
    onCleanup(() => {
      disposed = true
      if (timer) clearInterval(timer)
    })

    return {
      get ready() {
        return ready()
      },
      get status() {
        return status()
      },
      /** fase atual: primeira fase incompleta do estado real, ou null */
      get currentPhase() {
        const s = status()
        if (!s) return null
        return s.currentPhase
      },
      /** fases completadas do estado real */
      get completedPhases() {
        return status()?.completedPhases ?? []
      },
      /** fases que falharam */
      get failedPhases() {
        return status()?.failedPhases ?? []
      },
      get workspace() {
        return status()?.workspace
      },
      get updatedAt() {
        return status()?.updatedAt ?? 0
      },
      /** gates que já passaram */
      get gatesPassed() {
        return status()?.gatesPassed ?? {}
      },
      hasPhase(phase: string): boolean {
        return (status()?.completedPhases ?? []).includes(phase)
      },
      isFailed(phase: string): boolean {
        return (status()?.failedPhases ?? []).some((f) => f.phase === phase)
      },
      isRunning(phase: string): boolean {
        return status()?.currentPhase === phase
      },
    }
  },
})