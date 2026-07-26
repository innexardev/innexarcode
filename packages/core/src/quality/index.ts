export * as Quality from "./index"

import { ContextEngine } from "../context-engine"

export const QUALITY_DIMENSIONS = [
  "architecture", "backend", "frontend", "database", "security",
  "performance", "seo", "accessibility", "tests", "documentation",
  "devops", "ux",
] as const
export type QualityDimension = (typeof QUALITY_DIMENSIONS)[number]

export interface QualityCheck {
  name: string
  passed: boolean
  weight: number
  detail?: string
}

export interface QualityScore {
  dimension: QualityDimension
  score: number
  grade: "A" | "B" | "C" | "D" | "F"
  status: "good" | "warning" | "critical"
  checks: QualityCheck[]
  issues: string[]
  improvements: string[]
}

export interface QualityBoard {
  overall: number
  dimensions: QualityScore[]
  generatedAt: number
  summary: string
}

async function findFiles(dir: string, pattern: string, absolute?: boolean): Promise<string[]> {
  const results: string[] = []
  try {
    for await (const entry of new Bun.Glob(pattern).scan({ cwd: dir, absolute: absolute ?? true })) {
      results.push(entry)
    }
  } catch {}
  return results
}

async function exists(dir: string, name: string): Promise<boolean> {
  try {
    return await Bun.file(dir + "/" + name).exists()
  } catch {
    return false
  }
}

async function dirExists(parent: string, name: string): Promise<boolean> {
  try {
    for await (const _ of new Bun.Glob("*").scan({ cwd: parent + "/" + name })) {
      return true
    }
    return true
  } catch {
    return false
  }
}

async function readFileSafe(path: string): Promise<string | undefined> {
  try {
    return await Bun.file(path).text()
  } catch {
    return undefined
  }
}

async function grepFiles(dir: string, patterns: string[]): Promise<boolean> {
  try {
    const files = await findFiles(dir, "**/*.{ts,js,tsx,jsx,mjs,cjs}", false)
    const batch = files.slice(0, 200)
    for (const file of batch) {
      const content = await readFileSafe(dir + "/" + file)
      if (content && patterns.some((p) => content.includes(p))) return true
    }
  } catch {}
  return false
}

const IMPROVEMENT_MAP: Record<string, string[]> = {
  architecture: [
    "Organize code into modular layers (api, core, data)",
    "Add interfaces/ directory for dependency inversion",
    "Create a proper module structure with clear boundaries",
  ],
  backend: [
    "Add request validation schemas",
    "Implement centralized error handling middleware",
    "Add API documentation (OpenAPI/Swagger)",
    "Add authentication middleware",
    "Implement pagination for list endpoints",
  ],
  frontend: [
    "Organize UI into a components/ directory",
    "Add loading and error states to all data-fetching components",
    "Enable TypeScript strict mode",
    "Add responsive layout patterns",
  ],
  database: [
    "Add database migration files",
    "Create seed data scripts",
    "Add index definitions for query performance",
    "Define proper schema with foreign keys",
  ],
  security: [
    "Use environment variables for secrets (.env)",
    "Add authentication middleware",
    "Configure CORS properly",
    "Add security headers (helmet)",
    "Audit dependencies for vulnerabilities",
  ],
  performance: [
    "Implement lazy loading for routes and components",
    "Optimize images with proper formats and sizes",
    "Add cache headers for static assets",
    "Set up bundle analysis and code splitting",
  ],
  seo: [
    "Add meta tags (title, description) to all pages",
    "Add Open Graph and Twitter Card meta tags",
    "Generate a sitemap.xml",
    "Add robots.txt",
    "Use semantic HTML elements",
  ],
  accessibility: [
    "Add alt attributes to all images",
    "Add aria labels to interactive elements",
    "Ensure keyboard navigation works",
    "Check color contrast ratios",
    "Use semantic HTML landmarks",
  ],
  tests: [
    "Add unit tests for core logic",
    "Add integration tests for API endpoints",
    "Configure coverage thresholds",
    "Organize tests per module/feature",
  ],
  documentation: [
    "Write a comprehensive README",
    "Add API documentation",
    "Document complex logic with inline comments",
    "Add Architecture Decision Records (ADRs)",
    "Add a CONTRIBUTING guide",
  ],
  devops: [
    "Add Dockerfile for containerization",
    "Configure CI/CD pipeline",
    "Add healthcheck endpoint",
    "Add deployment configuration",
    "Set up monitoring and logging",
  ],
  ux: [
    "Add loading states for async operations",
    "Add error states with recovery actions",
    "Add empty states for lists",
    "Ensure responsive design",
    "Add consistent toast/notification system",
  ],
}

function weightedScore(checks: QualityCheck[]): number {
  const total = checks.reduce((sum, c) => sum + c.weight, 0)
  if (total === 0) return 0
  const passed = checks.filter((c) => c.passed).reduce((sum, c) => sum + c.weight, 0)
  return Math.round((passed / total) * 100)
}

function issuesFrom(checks: QualityCheck[]): string[] {
  return checks.filter((c) => !c.passed).map((c) => c.detail ?? c.name + " check failed")
}

function improvementsFrom(dimension: QualityDimension, checks: QualityCheck[]): string[] {
  const suggestions = IMPROVEMENT_MAP[dimension] ?? []
  const failed = checks.filter((c) => !c.passed).map((c) => c.name)
  return suggestions.filter((s) =>
    failed.some((f) => s.toLowerCase().includes(f.toLowerCase().split(" ")[0] ?? "")),
  ).slice(0, 3)
}

function buildScore(dimension: QualityDimension, checks: QualityCheck[]): QualityScore {
  const score = weightedScore(checks)
  return {
    dimension,
    score,
    grade: getGrade(score),
    status: getStatus(score),
    checks,
    issues: issuesFrom(checks),
    improvements: improvementsFrom(dimension, checks),
  }
}

function createCheck(name: string, passed: boolean, weight: number, detail?: string): QualityCheck {
  return { name, passed, weight, detail }
}

export function getGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A"
  if (score >= 80) return "B"
  if (score >= 65) return "C"
  if (score >= 50) return "D"
  return "F"
}

export function getStatus(score: number): "good" | "warning" | "critical" {
  if (score >= 80) return "good"
  if (score >= 50) return "warning"
  return "critical"
}

function summarize(board: QualityBoard): string {
  const good = board.dimensions.filter((d) => d.status === "good").length
  const warning = board.dimensions.filter((d) => d.status === "warning").length
  const critical = board.dimensions.filter((d) => d.status === "critical").length
  const topIssues = board.dimensions.flatMap((d) => d.issues).slice(0, 5)
  const parts: string[] = [
    `Overall: ${board.overall}/100 (${getGrade(board.overall)})`,
    `${good} good, ${warning} warning, ${critical} critical`,
  ]
  if (topIssues.length > 0) parts.push("Top issues: " + topIssues.join(", "))
  return parts.join(" | ")
}

export class QualityEngine {
  async scoreProject(projectPath: string, contextEngine?: ContextEngine): Promise<QualityBoard> {
    const dimensions = await Promise.all([
      this.scoreArchitecture(projectPath, contextEngine),
      this.scoreBackend(projectPath),
      this.scoreFrontend(projectPath),
      this.scoreDatabase(projectPath),
      this.scoreSecurity(projectPath),
      this.scorePerformance(projectPath),
      this.scoreSEO(projectPath),
      this.scoreAccessibility(projectPath),
      this.scoreTests(projectPath),
      this.scoreDocumentation(projectPath),
      this.scoreDevOps(projectPath),
      this.scoreUX(projectPath),
    ])
    const overall = Math.round(
      dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length,
    )
    const board: QualityBoard = {
      overall,
      dimensions,
      generatedAt: Date.now(),
      summary: "",
    }
    board.summary = summarize(board)
    return board
  }

  async scoreArchitecture(path: string, _engine?: ContextEngine): Promise<QualityScore> {
    const hasSrc = await dirExists(path, "src")
    const hasPackages = await dirExists(path, "packages")
    const hasModules = await dirExists(path, "modules")
    const hasTsconfig = await exists(path, "tsconfig.json")
    const hasEditorconfig = await exists(path, ".editorconfig")
    const hasConfigDir = await dirExists(path, "config")
    const srcFiles = hasSrc ? await findFiles(path + "/src", "**/*.ts", false) : []
    const depthOk = srcFiles.length === 0 || srcFiles.every((f) => f.split("/").length <= 6)
    const hasInterfaces = await dirExists(path, "src/interfaces") || await findFiles(path, "**/interfaces/**").then((r) => r.length > 0).catch(() => false)
    const hasApiLayer = await dirExists(path, "src/api") || await dirExists(path, "api")

    return buildScore("architecture", [
      createCheck("Source directory", hasSrc, 0.15, hasSrc ? undefined : "No src/ directory found"),
      createCheck("Module organization", hasPackages || hasModules || (srcFiles.length > 0), 0.15, !hasPackages && !hasModules ? "No module or package organization" : undefined),
      createCheck("TypeScript config", hasTsconfig, 0.1, !hasTsconfig ? "No tsconfig.json found" : undefined),
      createCheck("EditorConfig", hasEditorconfig, 0.05, !hasEditorconfig ? "No .editorconfig found" : undefined),
      createCheck("Configuration directory", hasConfigDir, 0.1, !hasConfigDir ? "No config/ directory" : undefined),
      createCheck("Interface segregation", hasInterfaces, 0.15, !hasInterfaces ? "No interfaces/ directory for dependency inversion" : undefined),
      createCheck("API layer separation", hasApiLayer, 0.1, !hasApiLayer ? "No separate API layer" : undefined),
      createCheck("Reasonable nesting depth", depthOk, 0.1, !depthOk ? "Files nested too deep (>6 levels)" : undefined),
      createCheck("Package manifest", await exists(path, "package.json"), 0.1, undefined),
    ])
  }

  async scoreBackend(path: string): Promise<QualityScore> {
    const routes = await findFiles(path, "**/*.{routes,router,controller,handler}.{ts,js}")
    const hasRoutes = routes.length > 0
    const hasValidation = await findFiles(path, "**/*.{validation,schema,dto,validator}.{ts,js}").then((r) => r.length > 0)
    const hasAuth = await findFiles(path, "**/*.auth.{ts,js}").then((r) => r.length > 0) ||
      await grepFiles(path, ["middleware", "guard", "interceptor"])
    const hasErrorHandler = await grepFiles(path, ["errorHandler", "error-middleware", "error_handler"])
    const hasPagination = await grepFiles(path, ["pagination", "paginate", "pageSize", "page="])
    const hasOpenAPI = await findFiles(path, "**/*.{openapi,swagger,api-spec}.{ts,js,json,yaml,yml}").then((r) => r.length > 0)
    const hasMiddleware = await dirExists(path, "src/middleware") || await findFiles(path, "**/middleware/**").then((r) => r.length > 0)

    return buildScore("backend", [
      createCheck("Route definitions", hasRoutes, 0.2, !hasRoutes ? "No route/controller files found" : undefined),
      createCheck("Validation schemas", hasValidation, 0.15, !hasValidation ? "No validation schemas found" : undefined),
      createCheck("Authentication", hasAuth, 0.15, !hasAuth ? "No auth middleware found" : undefined),
      createCheck("Error handling", hasErrorHandler, 0.15, !hasErrorHandler ? "No error handler found" : undefined),
      createCheck("Middleware pattern", hasMiddleware, 0.1, !hasMiddleware ? "No middleware directory" : undefined),
      createCheck("Pagination", hasPagination, 0.1, !hasPagination ? "No pagination pattern found" : undefined),
      createCheck("API documentation", hasOpenAPI, 0.15, !hasOpenAPI ? "No OpenAPI/Swagger specs found" : undefined),
    ])
  }

  async scoreFrontend(path: string): Promise<QualityScore> {
    const hasComponents = await dirExists(path, "src/components") || await dirExists(path, "components")
    const hasLoading = await grepFiles(path, ["Loading", "loading", "Skeleton", "spinner", "isLoading"])
    const hasError = await grepFiles(path, ["ErrorState", "error-state", "errorState", "ErrorMessage"])
    const hasEmpty = await grepFiles(path, ["EmptyState", "empty-state", "emptyState", "NoData"])
    const hasResponsive = await grepFiles(path, ["@media", "useMediaQuery", "responsive", "grid-cols"])
    const tsconfigContent = await readFileSafe(path + "/tsconfig.json")
    const hasTypescript = tsconfigContent !== undefined && tsconfigContent.includes("strict")
    const hasHooks = await dirExists(path, "src/hooks") || await dirExists(path, "hooks")
    const hasPages = await dirExists(path, "src/pages") || await dirExists(path, "pages")

    return buildScore("frontend", [
      createCheck("Components directory", hasComponents, 0.15, !hasComponents ? "No components/ directory" : undefined),
      createCheck("Loading states", hasLoading, 0.15, !hasLoading ? "No loading state patterns found" : undefined),
      createCheck("Error states", hasError, 0.15, !hasError ? "No error state handling found" : undefined),
      createCheck("Empty states", hasEmpty, 0.1, !hasEmpty ? "No empty state handling found" : undefined),
      createCheck("Responsive design", hasResponsive, 0.15, !hasResponsive ? "No responsive patterns found" : undefined),
      createCheck("TypeScript strict", hasTypescript, 0.1, !hasTypescript ? "TypeScript strict mode not enabled" : undefined),
      createCheck("Custom hooks", hasHooks, 0.1, !hasHooks ? "No hooks/ directory" : undefined),
      createCheck("Page routing", hasPages, 0.1, !hasPages ? "No pages/ directory" : undefined),
    ])
  }

  async scoreDatabase(path: string): Promise<QualityScore> {
    const migrations = await findFiles(path, "**/migrations/**/*.{sql,ts,js}")
    const hasMigrations = migrations.length > 0
    const seeds = await findFiles(path, "**/seed*.*")
    const hasSeeds = seeds.length > 0
    const hasSchema = await findFiles(path, "**/*.{schema,model,entity}.{ts,js,prisma,sql}").then((r) => r.length > 0)
    const hasIndexes = await findFiles(path, "**/indexes.*").then((r) => r.length > 0) ||
      await grepFiles(path, ["CREATE INDEX", "createIndex", "index:"])
    const hasForeignKeys = await grepFiles(path, ["foreignKey", "REFERENCES", "belongsTo", "hasMany"])
    const hasPrisma = await exists(path, "schema.prisma") || await findFiles(path, "**/schema.prisma").then((r) => r.length > 0)
    const hasDrizzle = await findFiles(path, "**/drizzle/**").then((r) => r.length > 0) ||
      await exists(path, "drizzle.config.ts")
    const hasQueryBuilder = await grepFiles(path, ["queryBuilder", "QueryBuilder", "knex", "drizzle-orm"])

    return buildScore("database", [
      createCheck("Migrations", hasMigrations, 0.2, !hasMigrations ? "No migration files found" : undefined),
      createCheck("Seed data", hasSeeds, 0.1, !hasSeeds ? "No seed scripts found" : undefined),
      createCheck("Schema definitions", hasSchema, 0.15, !hasSchema ? "No schema/entity files found" : undefined),
      createCheck("Index definitions", hasIndexes, 0.15, !hasIndexes ? "No index definitions found" : undefined),
      createCheck("Foreign key constraints", hasForeignKeys, 0.15, !hasForeignKeys ? "No foreign key relationships found" : undefined),
      createCheck("ORM usage", hasPrisma || hasDrizzle || hasQueryBuilder, 0.1, !hasPrisma && !hasDrizzle && !hasQueryBuilder ? "No ORM detected" : undefined),
      createCheck("Migration tooling", hasDrizzle || hasPrisma || await exists(path, "knexfile.ts") || await exists(path, "knexfile.js"), 0.15, undefined),
    ])
  }

  async scoreSecurity(path: string): Promise<QualityScore> {
    const hasEnv = await exists(path, ".env.example") || await exists(path, ".env")
    const hasHelmet = await grepFiles(path, ["helmet", "Helmet"])
    const hasCors = await grepFiles(path, ["cors", "CORS"])
    const hasAuthMiddleware = await grepFiles(path, ["authMiddleware", "authenticate", "requireAuth", "Authorization", "bearer"])
    const hasRateLimit = await grepFiles(path, ["rateLimit", "rate-limit", "RateLimiter", "express-rate-limit"])
    const hasCsrf = await grepFiles(path, ["csrf", "CSRF", "xsrf", "XSRF"])
    const hasDependencies = await exists(path, "package.json") || await exists(path, "Cargo.toml") || await exists(path, "requirements.txt")
    const hasGitignore = await exists(path, ".gitignore")
    const hasSecrets = await grepFiles(path, ["vault", "secret", "encrypt", "decrypt", "bcrypt", "argon2", "scrypt"])

    return buildScore("security", [
      createCheck("Environment variables", hasEnv, 0.15, !hasEnv ? "No .env or .env.example found" : undefined),
      createCheck("Security headers", hasHelmet, 0.15, !hasHelmet ? "No helmet/security headers detected" : undefined),
      createCheck("CORS configuration", hasCors, 0.15, !hasCors ? "No CORS configuration found" : undefined),
      createCheck("Authentication middleware", hasAuthMiddleware, 0.15, !hasAuthMiddleware ? "No auth middleware" : undefined),
      createCheck("Rate limiting", hasRateLimit, 0.1, !hasRateLimit ? "No rate limiting detected" : undefined),
      createCheck("CSRF protection", hasCsrf, 0.05, undefined),
      createCheck(".gitignore", hasGitignore, 0.1, !hasGitignore ? "No .gitignore found" : undefined),
      createCheck("Secrets handling", hasSecrets, 0.1, !hasSecrets ? "No encryption/hashing utilities found" : undefined),
      createCheck("Dependency file", hasDependencies, 0.05, undefined),
    ])
  }

  async scorePerformance(path: string): Promise<QualityScore> {
    const routes = await findFiles(path, "**/*.{tsx,jsx}", false)
    const hasLazyLoading = await grepFiles(path, ["lazy", "Lazy", "React.lazy", "Suspense", "dynamic import", "import("])
    const hasImageOpt = await grepFiles(path, ["next/image", "img optimization", "srcset", "sizes=", "loading="])
    const hasCache = await grepFiles(path, ["cache", "Cache-Control", "stale-while-revalidate", "SWR"])
    const hasBundleAnalysis = await grepFiles(path, ["bundle", "webpack-bundle", "vite-bundle"])
    const hasCodeSplitting = await grepFiles(path, ["code-split", "codeSplit", "splitChunks"])
    const hasMemo = await grepFiles(path, ["useMemo", "useCallback", "memo(", "React.memo"])
    const hasVirtualization = await grepFiles(path, ["virtualization", "virtual-scroll", "react-window", "react-virtuoso"])
    const hasSw = await findFiles(path, "**/*{sw,service-worker}*.*").then((r) => r.length > 0)
    const hasPreload = await grepFiles(path, ["preload", "prefetch", "preconnect", "dns-prefetch"])

    return buildScore("performance", [
      createCheck("Lazy loading", hasLazyLoading, 0.2, !hasLazyLoading ? "No lazy loading patterns found" : undefined),
      createCheck("Image optimization", hasImageOpt, 0.15, !hasImageOpt ? "No image optimization patterns found" : undefined),
      createCheck("Caching strategy", hasCache, 0.15, !hasCache ? "No caching strategy detected" : undefined),
      createCheck("Code splitting", hasCodeSplitting, 0.1, !hasCodeSplitting ? "No code splitting detected" : undefined),
      createCheck("Memoization", hasMemo, 0.1, !hasMemo ? "No memoization patterns found" : undefined),
      createCheck("Virtualization", hasVirtualization, 0.05, undefined),
      createCheck("Bundle analysis", hasBundleAnalysis, 0.1, !hasBundleAnalysis ? "No bundle analysis tooling" : undefined),
      createCheck("Resource hints", hasPreload, 0.1, !hasPreload ? "No preload/prefetch hints found" : undefined),
      createCheck("Service worker", hasSw, 0.05, undefined),
    ])
  }

  async scoreSEO(path: string): Promise<QualityScore> {
    const headFiles = await findFiles(path, "**/*{head,header,meta,seo}.{tsx,ts,jsx,js}", false)
    const hasMeta = headFiles.length > 0 || await grepFiles(path, ["<title", "meta name=\"description\"", "meta name='description'"])
    const hasOG = await grepFiles(path, ["og:", "property=\"og:", "property='og:", "OpenGraph"])
    const hasTwitterCard = await grepFiles(path, ["twitter:", "name=\"twitter:", "name='twitter:"])
    const hasSitemap = await exists(path, "public/sitemap.xml") || await exists(path, "sitemap.xml") || await exists(path, "sitemap-urls")
    const hasRobots = await exists(path, "public/robots.txt") || await exists(path, "robots.txt")
    const hasSemanticHTML = await grepFiles(path, ["<header", "<nav", "<main", "<article", "<section", "<footer"])
    const hasCanonical = await grepFiles(path, ["rel=\"canonical\"", "rel='canonical'"])
    const hasStructuredData = await grepFiles(path, ["application/ld+json", "itemscope", "itemprop", "schema.org"])
    const hasAltTags = await grepFiles(path, ["alt=", "alt={"])

    return buildScore("seo", [
      createCheck("Meta tags", hasMeta, 0.15, !hasMeta ? "No meta title/description found" : undefined),
      createCheck("Open Graph", hasOG, 0.15, !hasOG ? "No Open Graph tags found" : undefined),
      createCheck("Twitter Cards", hasTwitterCard, 0.1, !hasTwitterCard ? "No Twitter Card meta found" : undefined),
      createCheck("Sitemap", hasSitemap, 0.15, !hasSitemap ? "No sitemap.xml found" : undefined),
      createCheck("Robots.txt", hasRobots, 0.1, !hasRobots ? "No robots.txt found" : undefined),
      createCheck("Semantic HTML", hasSemanticHTML, 0.1, !hasSemanticHTML ? "No semantic HTML elements found" : undefined),
      createCheck("Canonical URLs", hasCanonical, 0.1, !hasCanonical ? "No canonical URLs found" : undefined),
      createCheck("Structured data", hasStructuredData, 0.1, !hasStructuredData ? "No structured data (Schema.org) found" : undefined),
      createCheck("Alt attributes", hasAltTags, 0.05, undefined),
    ])
  }

  async scoreAccessibility(path: string): Promise<QualityScore> {
    const hasAlt = await grepFiles(path, ["alt=", "alt={", "altText", "alt_text"])
    const hasAria = await grepFiles(path, ["aria-", "ariaLabel", "aria-label", "aria-labelledby", "aria-describedby"])
    const hasKeyboard = await grepFiles(path, ["onKeyDown", "onKeyPress", "tabIndex", "tabIndex={", "focus", "useFocus"])
    const hasRole = await grepFiles(path, ["role=\"", "role='", "role={"])
    const hasSkipLink = await grepFiles(path, ["skipLink", "skip-link", "skipToContent", "SkipNav"])
    const hasContrast = await grepFiles(path, ["contrast", "textColor", "foreground", "onColor"])
    const hasLabels = await grepFiles(path, ["<label", "htmlFor=", "htmlFor={", "useId("])
    const hasLiveRegion = await grepFiles(path, ["aria-live", "role=\"log\"", "role='log'", "role=\"alert\"", "role='alert'"])
    const hasLandmarks = await grepFiles(path, ["<header", "<nav", "<main", "<footer", "role=\"banner\"", "role=\"navigation\"", "role=\"main\""])

    return buildScore("accessibility", [
      createCheck("Alt attributes", hasAlt, 0.15, !hasAlt ? "No alt attributes found" : undefined),
      createCheck("ARIA attributes", hasAria, 0.15, !hasAria ? "No ARIA attributes found" : undefined),
      createCheck("Keyboard navigation", hasKeyboard, 0.15, !hasKeyboard ? "No keyboard event handlers found" : undefined),
      createCheck("Semantic roles", hasRole, 0.1, !hasRole ? "No ARIA roles found" : undefined),
      createCheck("Skip navigation", hasSkipLink, 0.1, !hasSkipLink ? "No skip navigation link found" : undefined),
      createCheck("Form labels", hasLabels, 0.1, !hasLabels ? "No form label associations found" : undefined),
      createCheck("Live regions", hasLiveRegion, 0.1, !hasLiveRegion ? "No ARIA live regions found" : undefined),
      createCheck("Landmarks", hasLandmarks, 0.1, !hasLandmarks ? "No landmark elements found" : undefined),
      createCheck("Color contrast", hasContrast, 0.05, undefined),
    ])
  }

  async scoreTests(path: string): Promise<QualityScore> {
    const testFiles = await findFiles(path, "**/*.{test,spec,e2e,integration,unit}.{ts,js,tsx,jsx}", false)
    const hasTests = testFiles.length > 0
    const types = new Set(testFiles.map((f) => f.includes(".e2e.") ? "e2e" : f.includes(".integration.") ? "integration" : "unit"))
    const hasUnit = types.has("unit") || testFiles.some((f) => !f.includes(".e2e.") && !f.includes(".integration."))
    const hasIntegration = types.has("integration")
    const hasE2e = types.has("e2e") || await dirExists(path, "e2e") || await dirExists(path, "cypress") || await dirExists(path, "playwright")
    const jestConfig = await readFileSafe(path + "/jest.config.ts")
    const hasCoverageConfig = await exists(path, ".nycrc") || await exists(path, "jest.config.ts") && (jestConfig !== undefined && jestConfig.includes("coverage")) ||
      await grepFiles(path, ["coverageThreshold", "coverageReporters"])
    const bunfig = await readFileSafe(path + "/bunfig.toml")
    const hasTestConfig = await exists(path, "jest.config.ts") || await exists(path, "jest.config.js") ||
      await exists(path, "vitest.config.ts") || await exists(path, ".bunrc") ||
      await exists(path, "bunfig.toml") && (bunfig !== undefined && bunfig.includes("test"))
    const hasTestUtils = await findFiles(path, "**/test-utils*.*").then((r) => r.length > 0) ||
      await findFiles(path, "**/{__mocks__,__fixtures__,testUtils,test-utils}/**").then((r) => r.length > 0)
    const hasParallel = await grepFiles(path, ["test.concurrent", "test.each", "describe.each", "it.concurrent"])
    const testCount = testFiles.length

    return buildScore("tests", [
      createCheck("Test files exist", hasTests, 0.15, !hasTests ? "No test files found" : undefined),
      createCheck("Unit tests", hasUnit, 0.15, !hasUnit ? "No unit tests found" : undefined),
      createCheck("Integration tests", hasIntegration, 0.12, !hasIntegration ? "No integration tests found" : undefined),
      createCheck("E2E tests", hasE2e, 0.1, !hasE2e ? "No E2E test setup found" : undefined),
      createCheck("Coverage configuration", hasCoverageConfig, 0.1, !hasCoverageConfig ? "No coverage thresholds configured" : undefined),
      createCheck("Test framework config", hasTestConfig, 0.1, !hasTestConfig ? "No test framework config found" : undefined),
      createCheck("Test utilities", hasTestUtils, 0.1, !hasTestUtils ? "No test utilities or mocks found" : undefined),
      createCheck("Parallel testing", hasParallel, 0.08, undefined),
      createCheck("Sufficient test count", testCount >= 5, 0.1, testCount < 5 ? `Only ${testCount} test files found (recommend ≥5)` : undefined),
    ])
  }

  async scoreDocumentation(path: string): Promise<QualityScore> {
    const hasReadme = await exists(path, "README.md")
    const hasContributing = await exists(path, "CONTRIBUTING.md")
    const hasChangelog = await exists(path, "CHANGELOG.md")
    const hasLicense = await exists(path, "LICENSE") || await exists(path, "LICENSE.md")
    const hasApiDocs = await findFiles(path, "**/{api-docs,api-documentation,swagger,openapi}/**").then((r) => r.length > 0) ||
      await dirExists(path, "docs/api")
    const hasDocsDir = await dirExists(path, "docs")
    const hasAdr = await dirExists(path, "docs/adr") || await dirExists(path, "docs/architecture") ||
      await dirExists(path, "adr") || await dirExists(path, "decisions")
    const hasInlineDocs = await grepFiles(path, ["/**", "* @param", "* @returns", "* @throws", "* @example"])
    const hasTypeDoc = await findFiles(path, "**/typedoc.json").then((r) => r.length > 0) ||
      await grepFiles(path, ["typedoc"])
    const hasWiki = await findFiles(path, "**/*.md").then((r) => r.length > 0)

    return buildScore("documentation", [
      createCheck("README", hasReadme, 0.2, !hasReadme ? "No README.md found" : undefined),
      createCheck("Contributing guide", hasContributing, 0.1, !hasContributing ? "No CONTRIBUTING.md" : undefined),
      createCheck("Changelog", hasChangelog, 0.1, !hasChangelog ? "No CHANGELOG.md" : undefined),
      createCheck("License", hasLicense, 0.1, !hasLicense ? "No LICENSE file" : undefined),
      createCheck("API documentation", hasApiDocs || hasDocsDir, 0.15, !hasApiDocs && !hasDocsDir ? "No API docs or docs/ directory" : undefined),
      createCheck("ADR directory", hasAdr, 0.1, !hasAdr ? "No ADR/architecture decision records" : undefined),
      createCheck("Inline documentation", hasInlineDocs, 0.1, !hasInlineDocs ? "No JSDoc/TSDocs found" : undefined),
      createCheck("Documentation tooling", hasTypeDoc, 0.05, undefined),
      createCheck("Wiki content", hasWiki, 0.1, !hasWiki ? "No markdown documentation files" : undefined),
    ])
  }

  async scoreDevOps(path: string): Promise<QualityScore> {
    const hasDockerfile = await exists(path, "Dockerfile") || await findFiles(path, "**/Dockerfile*").then((r) => r.length > 0)
    const hasDockerCompose = await exists(path, "docker-compose.yml") || await exists(path, "docker-compose.yaml") ||
      await findFiles(path, "**/docker-compose*.{yml,yaml}").then((r) => r.length > 0)
    const hasCi = await dirExists(path, ".github/workflows") || await exists(path, ".gitlab-ci.yml") ||
      await exists(path, ".circleci/config.yml") || await exists(path, "Jenkinsfile")
    const hasHealthcheck = await grepFiles(path, ["healthcheck", "health-check", "healthz", "readiness", "liveness"])
    const hasMonitoring = await grepFiles(path, ["prometheus", "grafana", "datadog", "newrelic", "sentry", "opentelemetry"])
    const hasLogging = await grepFiles(path, ["pino", "winston", "log4j", "log4js", "bunyan", "console.log"])
    const hasDeployConfig = await exists(path, "deploy") || await dirExists(path, "deploy") ||
      await exists(path, "k8s") || await dirExists(path, "k8s") ||
      await findFiles(path, "**/{deploy,deployment,helm,k8s,kubernetes}/**").then((r) => r.length > 0)
    const hasMakefile = await exists(path, "Makefile")
    const hasScripts = await dirExists(path, "scripts") || await dirExists(path, "bin")

    return buildScore("devops", [
      createCheck("Dockerfile", hasDockerfile, 0.15, !hasDockerfile ? "No Dockerfile found" : undefined),
      createCheck("Docker Compose", hasDockerCompose, 0.1, !hasDockerCompose ? "No docker-compose found" : undefined),
      createCheck("CI/CD pipeline", hasCi, 0.15, !hasCi ? "No CI/CD configuration found" : undefined),
      createCheck("Healthcheck", hasHealthcheck, 0.1, !hasHealthcheck ? "No healthcheck endpoint found" : undefined),
      createCheck("Monitoring", hasMonitoring, 0.1, !hasMonitoring ? "No monitoring setup found" : undefined),
      createCheck("Structured logging", hasLogging, 0.1, !hasLogging ? "No structured logging found" : undefined),
      createCheck("Deployment config", hasDeployConfig, 0.1, !hasDeployConfig ? "No deployment configuration found" : undefined),
      createCheck("Makefile", hasMakefile, 0.05, undefined),
      createCheck("Scripts directory", hasScripts, 0.1, !hasScripts ? "No scripts/ directory" : undefined),
      createCheck(".gitignore", await exists(path, ".gitignore"), 0.05, undefined),
    ])
  }

  async scoreUX(path: string): Promise<QualityScore> {
    const hasLoadingStates = await grepFiles(path, ["isLoading", "loading", "Loading", "Skeleton", "Spinner", "Progress"])
    const hasErrorStates = await grepFiles(path, ["error", "Error", "errorMessage", "errorState", "ErrorMessage", "ErrorBoundary"])
    const hasEmptyStates = await grepFiles(path, ["empty", "Empty", "NoData", "noResults", "no-results"])
    const hasToast = await grepFiles(path, ["toast", "Toast", "notification", "Notification", "snackbar", "Snackbar"])
    const hasResponsive = await grepFiles(path, ["@media", "useMediaQuery", "responsive", "max-width", "min-width", "grid-cols", "flex-wrap"])
    const hasSkeleton = await grepFiles(path, ["Skeleton", "skeleton", "Placeholder", "placeholder"]) || hasLoadingStates
    const hasDarkMode = await grepFiles(path, ["darkMode", "dark-mode", "dark:", "useDarkMode", "ThemeProvider"])
    const hasAnimation = await grepFiles(path, ["transition", "animation", "animate", "ease-", "transform", "motion", "framer-motion", "gsap"])
    const hasFormValidation = await grepFiles(path, ["validation", "validate", "formik", "react-hook-form", "useForm", "Formik"])
    const hasOptimistic = await grepFiles(path, ["optimistic", "useOptimistic", "isPending", "pending", "useTransition"])

    return buildScore("ux", [
      createCheck("Loading states", hasLoadingStates, 0.15, !hasLoadingStates ? "No loading states found" : undefined),
      createCheck("Error states", hasErrorStates, 0.15, !hasErrorStates ? "No error handling states found" : undefined),
      createCheck("Empty states", hasEmptyStates, 0.1, !hasEmptyStates ? "No empty state handling found" : undefined),
      createCheck("Toast/notifications", hasToast, 0.1, !hasToast ? "No toast/notification system found" : undefined),
      createCheck("Responsive design", hasResponsive, 0.1, !hasResponsive ? "No responsive patterns found" : undefined),
      createCheck("Skeleton/placeholders", hasSkeleton, 0.1, !hasSkeleton ? "No skeleton loaders found" : undefined),
      createCheck("Dark mode", hasDarkMode, 0.05, undefined),
      createCheck("Animations", hasAnimation, 0.05, undefined),
      createCheck("Form validation", hasFormValidation, 0.1, !hasFormValidation ? "No form validation found" : undefined),
      createCheck("Optimistic updates", hasOptimistic, 0.1, !hasOptimistic ? "No optimistic updates found" : undefined),
    ])
  }
}
