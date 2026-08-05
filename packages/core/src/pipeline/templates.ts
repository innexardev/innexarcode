export interface TemplatePhase {
  id: string
  name: string
  agent: string
  gates: string[]
  description?: string
}

export interface PipelineTemplate {
  id: string
  name: string
  description: string
  projectTypes: string[]
  phases: TemplatePhase[]
}

export const VALID_GATES: string[] = [
  "build",
  "lint",
  "types",
  "tests",
  "coverage",
  "security",
  "docker",
  "deploy",
]

const DELIVERY_GATES = ["build", "lint", "types", "tests", "security"]

const KNOWN_AGENTS = new Set([
  "auto",
  "planner",
  "architect",
  "qa",
  "qa-breaker",
  "code-reviewer",
  "questionador",
  "security",
  "auditor",
  "a11y",
  "ux-reviewer",
  "design-critic",
  "performance",
  "refactor",
  "documentation",
  "release-manager",
  "po",
  "ceo",
  "cto",
  "teacher",
  "mentor",
  "general",
  "explore",
])

function phase(id: string, name: string, agent: string, gates: string[] = []): TemplatePhase {
  return { id, name, agent, gates }
}

export const TEMPLATES: Record<string, PipelineTemplate> = {
  web: {
    id: "web",
    name: "Web Application",
    description:
      "Full lifecycle pipeline for web applications: research, architecture, implementation, QA, security, and release.",
    projectTypes: ["web", "webapp", "saas"],
    phases: [
      phase("discovery", "Discovery", "explore"),
      phase("research", "Research", "general"),
      phase("planning", "Planning", "planner"),
      phase("architecture", "Architecture", "architect"),
      phase("debate", "Debate", "general"),
      phase("implementation", "Implementation", "general"),
      phase("review", "Review", "code-reviewer", ["lint", "types"]),
      phase("qa", "QA", "qa", ["build", "tests"]),
      phase("security", "Security", "security", ["security", "build", "tests"]),
      phase("delivery", "Delivery", "release-manager", DELIVERY_GATES),
    ],
  },
  data: {
    id: "data",
    name: "Data Pipeline",
    description:
      "Pipeline for data, ETL, and analytics projects: data audit, schema design, implementation, validation, and monitoring.",
    projectTypes: ["data", "etl", "analytics"],
    phases: [
      phase("discovery", "Discovery", "explore"),
      phase("data-audit", "Data Audit", "auditor"),
      phase("schema-design", "Schema Design", "architect"),
      phase("implementation", "Implementation", "general"),
      phase("validation", "Validation", "qa", ["build", "tests"]),
      phase("monitoring", "Monitoring", "performance"),
      phase("delivery", "Delivery", "release-manager", DELIVERY_GATES),
    ],
  },
  infra: {
    id: "infra",
    name: "Infrastructure / DevOps",
    description:
      "Pipeline for infrastructure, DevOps, and IaC projects: planning, IaC design, security review, implementation, and deploy checks.",
    projectTypes: ["infra", "devops", "iac"],
    phases: [
      phase("discovery", "Discovery", "explore"),
      phase("planning", "Planning", "planner"),
      phase("iac-design", "IaC Design", "architect"),
      phase("security-review", "Security Review", "security", ["security"]),
      phase("implementation", "Implementation", "general"),
      phase("deploy-check", "Deploy Check", "qa", ["deploy", "build", "tests"]),
      phase("delivery", "Delivery", "release-manager", DELIVERY_GATES),
    ],
  },
  product: {
    id: "product",
    name: "Product & Market Research",
    description:
      "Pipeline for product, market research, and feature projects: market research, competitive analysis, pricing, and spec validation.",
    projectTypes: ["product", "market-research", "feature"],
    phases: [
      phase("discovery", "Discovery", "explore"),
      phase("market-research", "Market Research", "po"),
      phase("competitive-analysis", "Competitive Analysis", "po"),
      phase("pricing", "Pricing", "ceo"),
      phase("feature-spec", "Feature Spec", "po"),
      phase("validation", "Validation", "questionador"),
      phase("delivery", "Delivery", "release-manager"),
    ],
  },
  mobile: {
    id: "mobile",
    name: "Mobile App",
    description:
      "Full lifecycle pipeline for mobile apps: research, architecture, implementation, QA, and store checklist before release.",
    projectTypes: ["mobile", "ios", "android"],
    phases: [
      phase("discovery", "Discovery", "explore"),
      phase("research", "Research", "general"),
      phase("planning", "Planning", "planner"),
      phase("architecture", "Architecture", "architect"),
      phase("implementation", "Implementation", "general"),
      phase("review", "Review", "code-reviewer", ["lint", "types"]),
      phase("qa", "QA", "qa", ["build", "tests"]),
      phase("store-checklist", "Store Checklist", "po"),
      phase("delivery", "Delivery", "release-manager", DELIVERY_GATES),
    ],
  },
  api: {
    id: "api",
    name: "API / Backend Service",
    description:
      "Pipeline for API and backend services: research, architecture, implementation, review, security, and QA before release.",
    projectTypes: ["api", "backend", "service"],
    phases: [
      phase("discovery", "Discovery", "explore"),
      phase("research", "Research", "general"),
      phase("planning", "Planning", "planner"),
      phase("architecture", "Architecture", "architect"),
      phase("implementation", "Implementation", "general"),
      phase("review", "Review", "code-reviewer", ["lint", "types"]),
      phase("security", "Security", "security", ["security", "build", "tests"]),
      phase("qa", "QA", "qa", ["build", "tests"]),
      phase("delivery", "Delivery", "release-manager", DELIVERY_GATES),
    ],
  },
}

export class PipelineTemplates {
  static list() {
    return Object.values(TEMPLATES).map((template) => ({
      id: template.id,
      name: template.name,
      description: template.description,
      projectTypes: template.projectTypes,
      phaseCount: template.phases.length,
    }))
  }

  static get(id: string): PipelineTemplate {
    const template = TEMPLATES[id]
    if (!template) throw new Error(`Unknown template: ${id}`)
    return template
  }

  static validate(id: string): { ok: boolean; errors: string[] } {
    const template = TEMPLATES[id]
    if (!template) return { ok: false, errors: [`Unknown template: ${id}`] }

    const errors: string[] = []
    if (template.id !== id) {
      errors.push(`Template id ${template.id} does not match key ${id}`)
    }
    if (template.phases.length === 0) {
      errors.push(`Template ${id} has no phases`)
    }
    if (template.projectTypes.length === 0) {
      errors.push(`Template ${id} has no project types`)
    }
    for (const templatePhase of template.phases) {
      if (!templatePhase.id) errors.push(`Template ${id} has a phase without an id`)
      if (!templatePhase.name) errors.push(`Template ${id} phase ${templatePhase.id} has no name`)
      if (!templatePhase.agent) errors.push(`Template ${id} phase ${templatePhase.id} has no agent`)
      if (templatePhase.agent && !KNOWN_AGENTS.has(templatePhase.agent)) {
        errors.push(`Unknown agent: ${templatePhase.agent} in phase ${templatePhase.id}`)
      }
      for (const gate of templatePhase.gates) {
        if (!VALID_GATES.includes(gate)) {
          errors.push(`Template ${id} phase ${templatePhase.id} has invalid gate "${gate}"`)
        }
      }
    }
    return { ok: errors.length === 0, errors }
  }

  static forProjectType(type: string): PipelineTemplate[] {
    return Object.values(TEMPLATES).filter((template) => template.projectTypes.includes(type))
  }

  static phaseCount(id: string): number {
    return PipelineTemplates.get(id).phases.length
  }
}
