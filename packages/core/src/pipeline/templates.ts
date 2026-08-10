export interface TemplatePhase {
  id: string
  name: string
  agent: string
  gates: string[]
  description?: string
  subphases?: TemplatePhase[]
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
  "complexity",
  "deps",
  "duplication",
  "polish",
  "a11y",
  "licenses",
  "compat",
  "scope",
  "i18n",
  "seo",
  "market",
  "infra-cost",
  "onboarding",
  "analytics",
]

const DELIVERY_GATES = ["build", "lint", "types", "tests", "security", "polish"]

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

function phase(
  id: string,
  name: string,
  agent: string,
  gates: string[] = [],
  subphases?: TemplatePhase[],
): TemplatePhase {
  return { id, name, agent, gates, subphases }
}

const QA_SUBPHASES: TemplatePhase[] = [
  phase("unit", "Unit Tests", "qa", ["tests"]),
  phase("integration", "Integration Tests", "qa", ["tests"]),
]

const REVIEW_SUBPHASES: TemplatePhase[] = [
  phase("style", "Style Check", "code-reviewer", ["lint"]),
  phase("correctness", "Correctness", "code-reviewer", []),
  phase("tech-lead", "Tech Lead Review", "cto", []),
]

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
      phase("risk-assessment", "Risk Assessment", "planner"),
      phase("architecture", "Architecture", "architect"),
      phase("debate", "Debate", "general"),
      phase("implementation", "Implementation", "general"),
      phase("self-test", "Self Test", "qa", ["tests"]),
      phase("review", "Review", "code-reviewer", ["lint", "types"], REVIEW_SUBPHASES),
      phase("qa", "QA", "qa", ["build", "tests"], QA_SUBPHASES),
      phase("security", "Security", "security", ["security", "build", "tests"]),
      phase("rollout", "Rollout", "release-manager", ["deploy"]),
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
      phase("risk-assessment", "Risk Assessment", "planner"),
      phase("implementation", "Implementation", "general"),
      phase("self-test", "Self Test", "qa", ["tests"]),
      phase("validation", "Validation", "qa", ["build", "tests"]),
      phase("monitoring", "Monitoring", "performance"),
      phase("rollout", "Rollout", "release-manager", ["deploy"]),
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
      phase("risk-assessment", "Risk Assessment", "planner"),
      phase("iac-design", "IaC Design", "architect"),
      phase("security-review", "Security Review", "security", ["security"]),
      phase("compliance", "Compliance", "security", ["security"]),
      phase("implementation", "Implementation", "general"),
      phase("self-test", "Self Test", "qa", ["tests"]),
      phase("deploy-check", "Deploy Check", "qa", ["deploy", "build", "tests"]),
      phase("rollout", "Rollout", "release-manager", ["deploy"]),
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
      phase("risk-assessment", "Risk Assessment", "planner"),
      phase("pricing", "Pricing", "ceo"),
      phase("feature-spec", "Feature Spec", "po"),
      phase("self-test", "Self Test", "qa", ["tests"]),
      phase("validation", "Validation", "questionador"),
      phase("rollout", "Rollout", "release-manager", ["deploy"]),
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
      phase("risk-assessment", "Risk Assessment", "planner"),
      phase("architecture", "Architecture", "architect"),
      phase("implementation", "Implementation", "general"),
      phase("self-test", "Self Test", "qa", ["tests"]),
      phase("review", "Review", "code-reviewer", ["lint", "types"], REVIEW_SUBPHASES),
      phase("qa", "QA", "qa", ["build", "tests"], QA_SUBPHASES),
      phase("store-checklist", "Store Checklist", "po"),
      phase("rollout", "Rollout", "release-manager", ["deploy"]),
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
      phase("risk-assessment", "Risk Assessment", "planner"),
      phase("architecture", "Architecture", "architect"),
      phase("implementation", "Implementation", "general"),
      phase("self-test", "Self Test", "qa", ["tests"]),
      phase("review", "Review", "code-reviewer", ["lint", "types"], REVIEW_SUBPHASES),
      phase("security", "Security", "security", ["security", "build", "tests"]),
      phase("compliance", "Compliance", "security", ["security"]),
      phase("qa", "QA", "qa", ["build", "tests"], QA_SUBPHASES),
      phase("rollout", "Rollout", "release-manager", ["deploy"]),
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
    const validatePhases = (phases: TemplatePhase[], prefix: string) => {
      for (const p of phases) {
        if (!p.id) errors.push(`Template ${id} has a phase without an id`)
        if (!p.name) errors.push(`Template ${id} phase ${p.id} has no name`)
        if (!p.agent) errors.push(`Template ${id} phase ${p.id} has no agent`)
        if (p.agent && !KNOWN_AGENTS.has(p.agent)) {
          errors.push(`Unknown agent: ${p.agent} in phase ${prefix}${p.id}`)
        }
        for (const gate of p.gates) {
          if (!VALID_GATES.includes(gate)) {
            errors.push(`Template ${id} phase ${prefix}${p.id} has invalid gate "${gate}"`)
          }
        }
        if (p.subphases && p.subphases.length > 0) {
          validatePhases(p.subphases, `${prefix}${p.id} > `)
        }
      }
    }
    validatePhases(template.phases, "")
    return { ok: errors.length === 0, errors }
  }

  static forProjectType(type: string): PipelineTemplate[] {
    return Object.values(TEMPLATES).filter((template) => template.projectTypes.includes(type))
  }

  static phaseCount(id: string): number {
    return PipelineTemplates.get(id).phases.length
  }

  static phaseCountWithSubphases(id: string): number {
    const template = PipelineTemplates.get(id)
    let count = template.phases.length
    for (const p of template.phases) {
      if (p.subphases) count += p.subphases.length
    }
    return count
  }
}
