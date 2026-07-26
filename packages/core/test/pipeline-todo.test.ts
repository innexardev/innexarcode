import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Todo as PipelineTodo } from "@opencode-ai/core/pipeline"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, PipelineTodo.node])))

describe("PipelineTodo", () => {
  it.effect("creates an epic", () =>
    Effect.gen(function* () {
      const todo = yield* PipelineTodo.Service
      const epic = yield* todo.createEpic({ title: "Test Epic", description: "A test" })
      expect(epic.title).toBe("Test Epic")
      expect(epic.description).toBe("A test")
      expect(epic.id).toBeTruthy()
      expect(epic.phase).toBe("backlog")
      expect(epic.tasks).toEqual([])
    }),
  )

  it.effect("lists epics", () =>
    Effect.gen(function* () {
      const todo = yield* PipelineTodo.Service
      yield* todo.createEpic({ title: "Epic 1" })
      yield* todo.createEpic({ title: "Epic 2" })
      const epics = yield* todo.listEpics()
      expect(epics.length).toBe(2)
    }),
  )

  it.effect("creates a task within an epic", () =>
    Effect.gen(function* () {
      const todo = yield* PipelineTodo.Service
      const epic = yield* todo.createEpic({ title: "Epic" })
      const task = yield* todo.createTask(epic.id, {
        title: "Task 1",
        description: "Do something",
        priority: "high",
      })
      expect(task.title).toBe("Task 1")
      expect(task.priority).toBe("high")
      expect(task.phase).toBe("backlog")
      expect(task.status).toBe("pending")
      expect(task.gates).toBeTruthy()

      const epicWithTask = yield* todo.getEpic(epic.id)
      expect(epicWithTask!.tasks).toContain(task.id)
    }),
  )

  it.effect("lists tasks for an epic", () =>
    Effect.gen(function* () {
      const todo = yield* PipelineTodo.Service
      const epic = yield* todo.createEpic({ title: "Epic" })
      yield* todo.createTask(epic.id, { title: "Task A" })
      yield* todo.createTask(epic.id, { title: "Task B" })
      const tasks = yield* todo.listTasks(epic.id)
      expect(tasks.length).toBe(2)
    }),
  )

  it.effect("updates task phase", () =>
    Effect.gen(function* () {
      const todo = yield* PipelineTodo.Service
      const epic = yield* todo.createEpic({ title: "Epic" })
      const task = yield* todo.createTask(epic.id, { title: "Task" })
      yield* todo.updateTaskPhase(task.id, "implementation")
      const updated = yield* todo.getTask(task.id)
      expect(updated!.phase).toBe("implementation")
    }),
  )

  it.effect("passes gate", () =>
    Effect.gen(function* () {
      const todo = yield* PipelineTodo.Service
      const epic = yield* todo.createEpic({ title: "Epic" })
      const task = yield* todo.createTask(epic.id, { title: "Task" })
      yield* todo.passGate(task.id, "qa")
      const status = yield* todo.getGateStatus(task.id, "qa")
      expect(status).toBe("passed")
    }),
  )

  it.effect("fails gate and blocks task", () =>
    Effect.gen(function* () {
      const todo = yield* PipelineTodo.Service
      const epic = yield* todo.createEpic({ title: "Epic" })
      const task = yield* todo.createTask(epic.id, { title: "Task" })
      yield* todo.failGate(task.id, "qa", "Tests failing")
      const status = yield* todo.getGateStatus(task.id, "qa")
      expect(status).toBe("failed")
      const updated = yield* todo.getTask(task.id)
      expect(updated!.status).toBe("blocked")
      expect(updated!.risks).toContain("Gate failed at qa: Tests failing")
    }),
  )

  it.effect("adds dependency between tasks", () =>
    Effect.gen(function* () {
      const todo = yield* PipelineTodo.Service
      const epic = yield* todo.createEpic({ title: "Epic" })
      const taskA = yield* todo.createTask(epic.id, { title: "Task A" })
      const taskB = yield* todo.createTask(epic.id, { title: "Task B" })
      yield* todo.addDependency(taskB.id, taskA.id)
      const chain = yield* todo.getDependencyChain(taskB.id)
      expect(chain.length).toBe(2)
    }),
  )

  it.effect("getReadyTasks returns tasks with completed dependencies", () =>
    Effect.gen(function* () {
      const todo = yield* PipelineTodo.Service
      const epic = yield* todo.createEpic({ title: "Epic" })
      const taskA = yield* todo.createTask(epic.id, { title: "Task A" })
      const taskB = yield* todo.createTask(epic.id, { title: "Task B" })
      yield* todo.addDependency(taskB.id, taskA.id)
      yield* todo.updateTask(taskA.id, { status: "completed" })

      const ready = yield* todo.getReadyTasks()
      const readyIds = ready.map((t) => t.id)
      expect(readyIds).toContain(taskB.id)
    }),
  )

  it.effect("generates DoD checklist for known task types", () =>
    Effect.gen(function* () {
      const todo = yield* PipelineTodo.Service
      const checklist = yield* todo.generateChecklist("api")
      expect(checklist.length).toBeGreaterThan(0)
      const endpointItem = checklist.find((c) => c.label === "Endpoint definitions")
      expect(endpointItem).toBeTruthy()
      expect(endpointItem!.required).toBe(true)
    }),
  )

  it.effect("returns empty checklist for unknown task types", () =>
    Effect.gen(function* () {
      const todo = yield* PipelineTodo.Service
      const checklist = yield* todo.generateChecklist("nonexistent")
      expect(checklist).toEqual([])
    }),
  )

  it.effect("checks DoD with all items checked passes", () =>
    Effect.gen(function* () {
      const todo = yield* PipelineTodo.Service
      const epic = yield* todo.createEpic({ title: "Epic" })
      const task = yield* todo.createTask(epic.id, { title: "Task" })
      yield* todo.updateTask(task.id, {
        checklist: [
          { id: "1", label: "Login endpoint", checked: true, required: true },
          { id: "2", label: "Logout endpoint", checked: true, required: true },
        ],
      })
      const result = yield* todo.checkDoD(task.id)
      expect(result.passed).toBe(true)
      expect(result.missing).toEqual([])
    }),
  )

  it.effect("checks DoD with missing items fails", () =>
    Effect.gen(function* () {
      const todo = yield* PipelineTodo.Service
      const epic = yield* todo.createEpic({ title: "Epic" })
      const task = yield* todo.createTask(epic.id, { title: "Task" })
      yield* todo.updateTask(task.id, {
        checklist: [
          { id: "1", label: "Login endpoint", checked: false, required: true },
        ],
      })
      const result = yield* todo.checkDoD(task.id)
      expect(result.passed).toBe(false)
      expect(result.missing).toContain("Login endpoint")
    }),
  )

  it.effect("calculates epic progress", () =>
    Effect.gen(function* () {
      const todo = yield* PipelineTodo.Service
      const epic = yield* todo.createEpic({ title: "Epic" })
      const taskA = yield* todo.createTask(epic.id, { title: "Task A" })
      yield* todo.createTask(epic.id, { title: "Task B" })
      yield* todo.updateTask(taskA.id, { status: "completed" })

      const progress = yield* todo.getEpicProgress(epic.id)
      expect(progress.total).toBe(2)
      expect(progress.completed).toBe(1)
      expect(progress.percent).toBe(50)
    }),
  )

  it.effect("saves and loads state", () =>
    Effect.gen(function* () {
      const todo = yield* PipelineTodo.Service
      const epic = yield* todo.createEpic({ title: "Save Test" })
      yield* todo.createTask(epic.id, { title: "Saved Task" })

      const tmpPath = "/tmp/test-pipeline-todo.json"
      yield* todo.save(tmpPath)

      const todo2 = yield* PipelineTodo.Service
      yield* todo2.load(tmpPath)
      const epics = yield* todo2.listEpics()
      expect(epics.length).toBe(1)
      expect(epics[0].title).toBe("Save Test")
    }),
  )
})
