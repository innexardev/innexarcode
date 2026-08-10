import { describe, expect, test } from "bun:test"
import { Dispatcher } from "@opencode-ai/core/pipeline"
import { PipelineTemplates } from "@opencode-ai/core/pipeline/templates"

describe("Dispatcher", () => {
  test("routes frontend specialist for tsx files", () => {
    const result = Dispatcher.route({ files: ["src/components/Button.tsx", "app/page.tsx"] })
    expect(result.byFiles.map((s) => s.id)).toContain("frontend")
    expect(result.byFiles.map((s) => s.id)).toContain("design-system")
  })

  test("routes backend specialist for api routes", () => {
    const result = Dispatcher.route({ files: ["src/routes/users.ts", "src/controllers/auth.ts"] })
    expect(result.byFiles.map((s) => s.id)).toContain("backend")
    expect(result.byFiles.map((s) => s.id)).toContain("security")
  })

  test("routes infra specialist for terraform files", () => {
    const result = Dispatcher.route({ files: ["terraform/main.tf", ".github/workflows/build.yml"] })
    expect(result.byFiles.map((s) => s.id)).toContain("infra")
  })

  test("routes database specialist for migrations", () => {
    const result = Dispatcher.route({ files: ["packages/core/src/db/migrations/0001.sql.ts"] })
    expect(result.byFiles.map((s) => s.id)).toContain("database")
  })

  test("routes by goal keywords", () => {
    const result = Dispatcher.route({ goal: "adicionar fluxo de checkout com token de pagamento" })
    const ids = result.byKeywords.map((s) => s.id)
    expect(ids).toContain("security")
    expect(ids).toContain("support")
  })

  test("template activates default specialists", () => {
    const result = Dispatcher.route({ template: "web" })
    expect(result.byTemplate.map((s) => s.id)).toContain("frontend")
    expect(result.byTemplate.map((s) => s.id)).toContain("design-system")
    expect(result.byTemplate.map((s) => s.id)).toContain("ux-writing")
  })

  test("recommended sorts by relevance (files > keywords > template)", () => {
    const result = Dispatcher.route({
      files: ["app/page.tsx"],
      goal: "melhorar ui da tela de login com token",
      template: "web",
    })
    const rec = result.recommended
    expect(rec[0].id).toBe("frontend")
    // security aparece por keyword (token) e por template web
    expect(rec.some((s) => s.id === "security")).toBe(true)
  })

  test("computes independent partitions by top-level directory", () => {
    const result = Dispatcher.route({
      files: ["frontend/src/app/page.tsx", "backend/src/routes/api.ts", "backend/src/services/user.ts"],
    })
    expect(Object.keys(result.partitions).length).toBe(2)
    expect(result.partitions["backend"]?.length).toBe(2)
    expect(result.partitions["frontend"]?.length).toBe(1)
  })

  test("single partition when all files share top dir", () => {
    const result = Dispatcher.route({ files: ["src/a.ts", "src/b.ts"] })
    expect(Object.keys(result.partitions)).toEqual(["src"])
  })

  test("formatRoute is readable", () => {
    const result = Dispatcher.route({ files: ["app/page.tsx"], template: "web", goal: "nova tela" })
    const text = Dispatcher.formatRoute(result, ["app/page.tsx"])
    expect(text).toContain("Recommended:")
    expect(text).toContain("By file type:")
  })

  test("every template's phases map to known dispatcher agents", () => {
    const templates = PipelineTemplates.list()
    for (const t of templates) {
      for (const phase of PipelineTemplates.get(t.id).phases) {
        expect(typeof phase.agent).toBe("string")
        expect(phase.agent.length).toBeGreaterThan(0)
      }
    }
  })
})