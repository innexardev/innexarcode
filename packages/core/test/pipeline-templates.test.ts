import { describe, expect, test } from "bun:test"
import { PipelineTemplates, TEMPLATES } from "@opencode-ai/core/pipeline/templates"

describe("PipelineTemplates", () => {
  test("list returns at least 6 templates", () => {
    const templates = PipelineTemplates.list()
    expect(templates.length).toBeGreaterThanOrEqual(6)
    expect(templates[0]).toHaveProperty("phaseCount")
  })

  test("get('product') returns template with market-research, competitive-analysis and pricing phases", () => {
    const product = PipelineTemplates.get("product")
    const phaseIds = product.phases.map((p) => p.id)
    expect(phaseIds).toContain("market-research")
    expect(phaseIds).toContain("competitive-analysis")
    expect(phaseIds).toContain("pricing")
    for (const p of product.phases) {
      expect(p.name).toBeTruthy()
    }
  })

  test("get('web') has 13 phases starting with discovery and ending with delivery", () => {
    const web = PipelineTemplates.get("web")
    expect(web.phases.length).toBe(13)
    expect(web.phases[0].id).toBe("discovery")
    expect(web.phases[web.phases.length - 1].id).toBe("delivery")
  })

  test("validate('web') returns ok with no errors", () => {
    const result = PipelineTemplates.validate("web")
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
  })

  test("validate('nonexistent') returns not ok with an error", () => {
    const result = PipelineTemplates.validate("nonexistent")
    expect(result.ok).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  test("forProjectType matches web and product types", () => {
    const saas = PipelineTemplates.forProjectType("saas")
    expect(saas.map((t) => t.id)).toContain("web")
    const feature = PipelineTemplates.forProjectType("feature")
    expect(feature.map((t) => t.id)).toContain("product")
  })

  test("every template id matches its key and validates", () => {
    const ids = Object.keys(TEMPLATES)
    expect(ids.length).toBeGreaterThanOrEqual(6)
    for (const id of ids) {
      expect(TEMPLATES[id].id).toBe(id)
      const result = PipelineTemplates.validate(id)
      expect(result.ok).toBe(true)
      expect(result.errors).toEqual([])
    }
  })
})
