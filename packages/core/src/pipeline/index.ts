export * as Pipeline from "./index"
export * as Todo from "./todo"

import { Context, Effect, Schema } from "effect"
import { State } from "../state"

export const Phase = Schema.Union([
  Schema.Literal("discovery"),
  Schema.Literal("research"),
  Schema.Literal("planning"),
  Schema.Literal("architecture"),
  Schema.Literal("debate"),
  Schema.Literal("implementation"),
  Schema.Literal("review"),
  Schema.Literal("qa"),
  Schema.Literal("security"),
  Schema.Literal("self-critique"),
  Schema.Literal("question"),
  Schema.Literal("audit"),
  Schema.Literal("delivery"),
])
export type Phase = typeof Phase.Type

export const PHASE_ORDER: Phase[] = [
  "discovery",
  "research",
  "planning",
  "architecture",
  "debate",
  "implementation",
  "review",
  "qa",
  "security",
  "self-critique",
  "question",
  "audit",
  "delivery",
]

export const PHASE_LABELS: Record<Phase, string> = {
  discovery: "Discovery",
  research: "Research",
  planning: "Planning",
  architecture: "Architecture",
  debate: "Debate",
  implementation: "Implementation",
  review: "Review",
  qa: "QA",
  security: "Security",
  "self-critique": "Self-Critique",
  question: "Question",
  audit: "Audit",
  delivery: "Delivery",
}
