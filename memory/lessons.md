# Engineering OS — Lessons Learned

## Schema.Literal in Effect expects single args
Don't pass multiple strings: `Schema.Literal("a", "b", "c")`. Use `Schema.Literal("a" as const, "b" as const, "c" as const)` with the `as const` pattern, or union them: `Schema.Union(Schema.Literal("a"), Schema.Literal("b"))`. Always verify the exact API signature in the version being used.

## Effect Schema readonly arrays
When you define `Schema.Array(Schema.String)`, the decoded TypeScript type is `readonly string[]`, not `string[]`. This breaks mutation patterns in runtime code. Use `Schema.mutable(Schema.Array(Schema.String))` for runtime arrays, or keep plain TypeScript types for runtime data and use Schema only at serialization boundaries.

## Auto agent must never write code
Every time auto agent directly modified a source file, it introduced inconsistencies or broke patterns. Hands-down rule: auto selects agents, delegates tasks, manages TODOs, synthesizes results — but never implements. Violations must be caught in review and blocked.

## Pipeline gates are non-negotiable
Multiple incidents where a "small fix" bypassed the pipeline and caused regressions. The 13-phase pipeline is not overhead — it's the quality guarantee. Even one-line changes must pass through the complete pipeline.

## Context window management
The context engine's dependency graph pruning is the single biggest token saver. Without it, every agent loads the entire project. Initial indexing costs ~200K tokens but saves 5-10x per subsequent agent task. Always regenerate the index when project structure changes.

## ADR numbering
ADRs use sequential numbering (ADR-001, ADR-002...). When multiple ADRs are generated concurrently, use an incrementing counter to avoid collisions. Never reuse or skip numbers.
