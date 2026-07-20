export * as Todo from "./todo"

import { Array, Context, Effect, Layer, Schema } from "effect"
import { makeLocationNode } from "../effect/app-node"

export const TaskPhase = Schema.Union([
  Schema.Literal("backlog"),
  Schema.Literal("discovery"),
  Schema.Literal("research"),
  Schema.Literal("architecture"),
  Schema.Literal("planning"),
  Schema.Literal("plan_review"),
  Schema.Literal("implementation"),
  Schema.Literal("review"),
  Schema.Literal("qa"),
  Schema.Literal("security"),
  Schema.Literal("performance"),
  Schema.Literal("ux"),
  Schema.Literal("documentation"),
  Schema.Literal("release"),
  Schema.Literal("done"),
])
export type TaskPhase = typeof TaskPhase.Type

export const TaskStatus = Schema.Union([
  Schema.Literal("pending"),
  Schema.Literal("in_progress"),
  Schema.Literal("blocked"),
  Schema.Literal("completed"),
  Schema.Literal("failed"),
  Schema.Literal("cancelled"),
])
export type TaskStatus = typeof TaskStatus.Type

export const GateResult = Schema.Union([
  Schema.Literal("passed"),
  Schema.Literal("failed"),
  Schema.Literal("pending"),
])
export type GateResult = typeof GateResult.Type

export const Priority = Schema.Union([
  Schema.Literal("critical"),
  Schema.Literal("high"),
  Schema.Literal("medium"),
  Schema.Literal("low"),
])
export type Priority = typeof Priority.Type

export const TaskPhaseValues: TaskPhase[] = [
  "backlog", "discovery", "research", "architecture", "planning",
  "plan_review", "implementation", "review", "qa", "security",
  "performance", "ux", "documentation", "release", "done",
]

export const TodoItem = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  description: Schema.optional(Schema.String),
  phase: TaskPhase,
  status: TaskStatus,
  priority: Priority,
  dependsOn: Schema.Array(Schema.String),
  blockedBy: Schema.Array(Schema.String),
  gates: Schema.Record(TaskPhase, GateResult),
  assignedTo: Schema.optional(Schema.String),
  agent: Schema.optional(Schema.String),
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
  completedAt: Schema.optional(Schema.Number),
  tokensUsed: Schema.optional(Schema.Number),
  modelUsed: Schema.optional(Schema.String),
  checklist: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      label: Schema.String,
      checked: Schema.Boolean,
      required: Schema.Boolean,
    }),
  ),
  files: Schema.Array(Schema.String),
  risks: Schema.Array(Schema.String),
})
export type TodoItem = typeof TodoItem.Type

export const Epic = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  description: Schema.optional(Schema.String),
  phase: TaskPhase,
  tasks: Schema.Array(Schema.String),
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
  completedAt: Schema.optional(Schema.Number),
})
export type Epic = typeof Epic.Type

export const DoDTemplate = Schema.Struct({
  taskType: Schema.String,
  items: Schema.Array(
    Schema.Struct({
      label: Schema.String,
      optional: Schema.Boolean,
    }),
  ),
})
export type DoDTemplate = typeof DoDTemplate.Type

function newGates(): Record<string, GateResult> {
  const gates: Record<string, GateResult> = {}
  for (const p of TaskPhaseValues) gates[p] = "pending"
  return gates
}

const DOD_TEMPLATES: Record<string, {
  taskType: string
  items: { label: string; optional: boolean }[]
}> = {
  auth: {
    taskType: "auth",
    items: [
      { label: "Login endpoint", optional: false },
      { label: "Logout endpoint", optional: false },
      { label: "Password reset flow", optional: false },
      { label: "MFA / 2FA", optional: true },
      { label: "Rate limiting on auth routes", optional: false },
      { label: "Audit logging for auth events", optional: false },
      { label: "Unit tests for auth flows", optional: false },
      { label: "API documentation", optional: false },
    ],
  },
  crud: {
    taskType: "crud",
    items: [
      { label: "Create operation", optional: false },
      { label: "Read operation", optional: false },
      { label: "Update operation", optional: false },
      { label: "Delete operation", optional: false },
      { label: "Input validation", optional: false },
      { label: "Pagination / filtering", optional: true },
      { label: "Permission checks", optional: false },
      { label: "Unit tests", optional: false },
    ],
  },
  stripe: {
    taskType: "stripe",
    items: [
      { label: "Webhook endpoint", optional: false },
      { label: "Checkout session", optional: false },
      { label: "Subscription management", optional: false },
      { label: "Refund handling", optional: false },
      { label: "Receipt / invoice", optional: true },
      { label: "Unit tests", optional: false },
    ],
  },
  api: {
    taskType: "api",
    items: [
      { label: "Endpoint definitions", optional: false },
      { label: "Request validation", optional: false },
      { label: "Authentication / authorization", optional: false },
      { label: "Rate limiting", optional: true },
      { label: "API documentation", optional: false },
      { label: "Integration tests", optional: false },
    ],
  },
  ui: {
    taskType: "ui",
    items: [
      { label: "Component implementation", optional: false },
      { label: "Loading state", optional: false },
      { label: "Error state", optional: false },
      { label: "Empty state", optional: false },
      { label: "Responsive layout", optional: false },
      { label: "Accessibility (a11y)", optional: false },
      { label: "Unit / component tests", optional: false },
    ],
  },
  database: {
    taskType: "database",
    items: [
      { label: "Migration script", optional: false },
      { label: "Seed data", optional: true },
      { label: "Indexes for performance", optional: false },
      { label: "Rollback plan", optional: false },
      { label: "Tests", optional: false },
    ],
  },
  integration: {
    taskType: "integration",
    items: [
      { label: "Webhook receiver", optional: false },
      { label: "Retry logic", optional: false },
      { label: "Error handling / circuit breaker", optional: false },
      { label: "Monitoring / alerting", optional: false },
      { label: "Integration tests", optional: false },
    ],
  },
}

export interface Interface {
  readonly createEpic: (input: { title: string; description?: string }) => Effect.Effect<Epic>
  readonly getEpic: (id: string) => Effect.Effect<Epic | undefined>
  readonly listEpics: () => Effect.Effect<Epic[]>
  readonly updateEpicPhase: (id: string, phase: TaskPhase) => Effect.Effect<void>
  readonly createTask: (epicId: string, input: { title: string; description?: string; priority?: string }) => Effect.Effect<TodoItem>
  readonly getTask: (id: string) => Effect.Effect<TodoItem | undefined>
  readonly listTasks: (epicId?: string) => Effect.Effect<TodoItem[]>
  readonly updateTask: (id: string, updates: Partial<TodoItem>) => Effect.Effect<void>
  readonly updateTaskPhase: (id: string, phase: TaskPhase) => Effect.Effect<void>
  readonly passGate: (taskId: string, phase: TaskPhase) => Effect.Effect<void>
  readonly failGate: (taskId: string, phase: TaskPhase, reason: string) => Effect.Effect<void>
  readonly getGateStatus: (taskId: string, phase: TaskPhase) => Effect.Effect<GateResult>
  readonly addDependency: (taskId: string, dependsOn: string) => Effect.Effect<void>
  readonly getDependencyChain: (taskId: string) => Effect.Effect<TodoItem[]>
  readonly getReadyTasks: () => Effect.Effect<TodoItem[]>
  readonly getDoD: (taskType: string) => Effect.Effect<DoDTemplate | undefined>
  readonly generateChecklist: (taskType: string) => Effect.Effect<{ label: string; checked: boolean; required: boolean }[]>
  readonly checkDoD: (taskId: string) => Effect.Effect<{ passed: boolean; missing: string[] }>
  readonly getEpicProgress: (epicId: string) => Effect.Effect<{ percent: number; completed: number; total: number }>
  readonly getOverallProgress: () => Effect.Effect<{ percent: number; done: number; total: number }>
  readonly save: (path: string) => Effect.Effect<void>
  readonly load: (path: string) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/PipelineTodo") {}

let nextId = 1
function generateId(): string {
  return `todo-${Date.now()}-${nextId++}`
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const epics = new Map<string, Epic>()
    const tasks = new Map<string, TodoItem>()

    const createEpic = Effect.fn("PipelineTodo.createEpic")(function* (input: { title: string; description?: string }) {
      const now = Date.now()
      const epic: Epic = {
        id: generateId(),
        title: input.title,
        description: input.description,
        phase: "backlog" as TaskPhase,
        tasks: [],
        createdAt: now,
        updatedAt: now,
      }
      epics.set(epic.id, epic)
      return epic
    })

    const getEpic = Effect.fn("PipelineTodo.getEpic")(function* (id: string) {
      return epics.get(id)
    })

    const listEpics = Effect.fn("PipelineTodo.listEpics")(function* () {
      return Array.fromIterable(epics.values())
    })

    const updateEpicPhase = Effect.fn("PipelineTodo.updateEpicPhase")(function* (id: string, phase: TaskPhase) {
      const epic = epics.get(id)
      if (epic) {
        epics.set(id, { ...epic, phase, updatedAt: Date.now() })
      }
    })

    const createTask = Effect.fn("PipelineTodo.createTask")(function* (
      epicId: string,
      input: { title: string; description?: string; priority?: string },
    ) {
      const epic = epics.get(epicId)
      if (!epic) return yield* Effect.die(new Error(`Epic not found: ${epicId}`))
      const now = Date.now()
      const task: TodoItem = {
        id: generateId(),
        title: input.title,
        description: input.description,
        phase: "backlog" as TaskPhase,
        status: "pending" as TaskStatus,
        priority: (input.priority ?? "medium") as Priority,
        dependsOn: [],
        blockedBy: [],
        gates: newGates() as Record<TaskPhase, GateResult>,
        createdAt: now,
        updatedAt: now,
        checklist: [],
        files: [],
        risks: [],
      }
      tasks.set(task.id, task)
      epics.set(epicId, { ...epic, tasks: [...epic.tasks, task.id], updatedAt: now })
      return task
    })

    const getTask = Effect.fn("PipelineTodo.getTask")(function* (id: string) {
      return tasks.get(id)
    })

    const listTasks = Effect.fn("PipelineTodo.listTasks")(function* (epicId?: string) {
      if (epicId) {
        const epic = epics.get(epicId)
        if (!epic) return []
        const result: TodoItem[] = []
        for (const id of epic.tasks) {
          const task = tasks.get(id)
          if (task) result.push(task)
        }
        return result
      }
      return Array.fromIterable(tasks.values())
    })

    const updateTask = Effect.fn("PipelineTodo.updateTask")(function* (id: string, updates: Partial<TodoItem>) {
      const task = tasks.get(id)
      if (task) {
        tasks.set(id, { ...task, ...updates, updatedAt: Date.now() })
      }
    })

    const updateTaskPhase = Effect.fn("PipelineTodo.updateTaskPhase")(function* (id: string, phase: TaskPhase) {
      const task = tasks.get(id)
      if (task) {
        const completedAt = phase === "done" ? Date.now() : task.completedAt
        tasks.set(id, { ...task, phase, updatedAt: Date.now(), completedAt })
      }
    })

    const passGate = Effect.fn("PipelineTodo.passGate")(function* (taskId: string, phase: TaskPhase) {
      const task = tasks.get(taskId)
      if (task) {
        tasks.set(taskId, {
          ...task,
          gates: { ...task.gates, [phase]: "passed" as GateResult },
          updatedAt: Date.now(),
        })
      }
    })

    const failGate = Effect.fn("PipelineTodo.failGate")(function* (taskId: string, phase: TaskPhase, reason: string) {
      const task = tasks.get(taskId)
      if (task) {
        tasks.set(taskId, {
          ...task,
          gates: { ...task.gates, [phase]: "failed" as GateResult },
          status: "blocked" as TaskStatus,
          risks: [...task.risks, `Gate failed at ${phase}: ${reason}`],
          updatedAt: Date.now(),
        })
      }
    })

    const getGateStatus = Effect.fn("PipelineTodo.getGateStatus")(function* (taskId: string, phase: TaskPhase) {
      const task = tasks.get(taskId)
      if (!task) return "pending" as GateResult
      return task.gates[phase] ?? ("pending" as GateResult)
    })

    const addDependency = Effect.fn("PipelineTodo.addDependency")(function* (taskId: string, dependsOn: string) {
      const task = tasks.get(taskId)
      const dependsTask = tasks.get(dependsOn)
      if (task && dependsTask) {
        tasks.set(taskId, { ...task, dependsOn: [...task.dependsOn, dependsOn] })
        tasks.set(dependsOn, { ...dependsTask, blockedBy: [...dependsTask.blockedBy, taskId] })
      }
    })

    const getDependencyChain = Effect.fn("PipelineTodo.getDependencyChain")(function* (taskId: string) {
      const visited = new Set<string>()
      const result: TodoItem[] = []
      const visit = (id: string) => {
        if (visited.has(id)) return
        visited.add(id)
        const task = tasks.get(id)
        if (task) {
          result.push(task)
          for (const depId of task.dependsOn) visit(depId)
        }
      }
      visit(taskId)
      return result
    })

    const getReadyTasks = Effect.fn("PipelineTodo.getReadyTasks")(function* () {
      const ready: TodoItem[] = []
      for (const task of tasks.values()) {
        if (task.status === ("completed" as TaskStatus)) continue
        if (task.status === ("cancelled" as TaskStatus)) continue
        const depsMet = task.dependsOn.every((depId) => {
          const dep = tasks.get(depId)
          return dep?.status === ("completed" as TaskStatus)
        })
        if (depsMet) ready.push(task)
      }
      return ready
    })

    const getDoD = Effect.fn("PipelineTodo.getDoD")(function* (taskType: string) {
      const template = DOD_TEMPLATES[taskType]
      if (!template) return undefined
      return template as DoDTemplate
    })

    const generateChecklist = Effect.fn("PipelineTodo.generateChecklist")(function* (taskType: string) {
      const template = DOD_TEMPLATES[taskType]
      if (!template) return []
      return template.items.map((item) => ({
        label: item.label,
        checked: false,
        required: !item.optional,
      }))
    })

    const checkDoD = Effect.fn("PipelineTodo.checkDoD")(function* (taskId: string) {
      const task = tasks.get(taskId)
      if (!task) return { passed: false, missing: ["Task not found"] }
      const missing: string[] = []
      for (const item of task.checklist) {
        if (item.required && !item.checked) missing.push(item.label)
      }
      return { passed: missing.length === 0, missing }
    })

    const getEpicProgress = Effect.fn("PipelineTodo.getEpicProgress")(function* (epicId: string) {
      const epic = epics.get(epicId)
      if (!epic || epic.tasks.length === 0) return { percent: 0, completed: 0, total: 0 }
      let completed = 0
      for (const id of epic.tasks) {
        const t = tasks.get(id)
        if (t?.status === ("completed" as TaskStatus)) completed++
      }
      return { percent: Math.round((completed / epic.tasks.length) * 100), completed, total: epic.tasks.length }
    })

    const getOverallProgress = Effect.fn("PipelineTodo.getOverallProgress")(function* () {
      const all = Array.fromIterable(tasks.values())
      if (all.length === 0) return { percent: 0, done: 0, total: 0 }
      let done = 0
      for (const task of all) {
        if (task.status === ("completed" as TaskStatus)) done++
      }
      return { percent: Math.round((done / all.length) * 100), done, total: all.length }
    })

    const save = Effect.fn("PipelineTodo.save")(function* (path: string) {
      const data = JSON.stringify({
        epics: Array.fromIterable(epics.entries()),
        tasks: Array.fromIterable(tasks.entries()),
      })
      yield* Effect.promise(() => Bun.write(path, data))
    })

    const load = Effect.fn("PipelineTodo.load")(function* (path: string) {
      const content = yield* Effect.promise(() => Bun.file(path).text())
      const data = JSON.parse(content) as { epics: [string, Epic][]; tasks: [string, TodoItem][] }
      epics.clear()
      tasks.clear()
      for (const [id, epic] of data.epics) epics.set(id, epic)
      for (const [id, task] of data.tasks) tasks.set(id, task)
    })

    return Service.of({
      createEpic, getEpic, listEpics, updateEpicPhase,
      createTask, getTask, listTasks, updateTask, updateTaskPhase,
      passGate, failGate, getGateStatus,
      addDependency, getDependencyChain, getReadyTasks,
      getDoD, generateChecklist, checkDoD,
      getEpicProgress, getOverallProgress,
      save, load,
    })
  }),
)

export const node = makeLocationNode({ service: Service, layer, deps: [] })
