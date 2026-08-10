/**
 * SEO gate — templates web/product.
 *
 * Verifica:
 *  1. Páginas novas no diff têm meta tags próprias (title + description + OG)
 *  2. sitemap.xml e robots.txt existem (ou são gerados por config)
 *  3. URLs semânticas: sem IDs crus óbvios em rotas novas (page/[id].tsx etc.)
 *
 * Regras:
 *  - Não-frontend → not applicable
 *  - Página nova sem title/description/OG → FAIL (bloqueante)
 *  - sitemap/robots ausentes → WARN
 *  - Rota com ID cru → WARN (sugere slug)
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const WORKSPACE = process.env.OPENCODE_WORKSPACE ?? "/root/opencode-engos"
const BASE = process.env.OPENCODE_BASE_BRANCH ?? "dev"

const pkgPath = join(WORKSPACE, "package.json")
if (!existsSync(pkgPath)) {
  console.log("seo: not applicable (no package.json)")
  process.exit(0)
}

const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"))
const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
const isFrontend = Object.keys(deps).some((d) => /^(react|next|vue|svelte|@angular|astro|nuxt)/.test(d)) || existsSync(join(WORKSPACE, "src", "app")) || existsSync(join(WORKSPACE, "pages"))

if (!isFrontend) {
  console.log("seo: not applicable (non-frontend project)")
  process.exit(0)
}

function tryGit(args: string[]): string | null {
  try {
    return execFileSync("git", args, { cwd: WORKSPACE, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] })
  } catch {
    return null
  }
}

function baseRef(): string | null {
  for (const ref of [BASE, "origin/dev", "origin/main", "HEAD~1"]) {
    const ok = tryGit(["rev-parse", "--verify", "--quiet", ref])
    if (ok !== null && ok.trim() !== "") return ref
  }
  return null
}

const base = baseRef()
let newPages: string[] = []
if (base) {
  const out: string[] = []
  for (const args of [
    ["diff", `${base}...HEAD`, "--name-only", "--diff-filter=ACM"],
    ["diff", "--cached", "--name-only", "--diff-filter=ACM"],
    ["diff", "--name-only", "--diff-filter=ACM"],
  ]) {
    const r = tryGit(args)
    if (r) out.push(...r.split("\n").filter(Boolean))
  }
  newPages = [...new Set(out)].filter((f) => /(^|\/)(page|index|routes?)\.[jt]sx?$/.test(f) || /(^|\/)pages?\//.test(f))
}

// 1. Meta tags nas páginas novas
const missingMeta: string[] = []
for (const page of newPages) {
  const full = join(WORKSPACE, page)
  if (!existsSync(full)) continue
  const content = readFileSync(full, "utf-8")
  const hasTitle = /<title>|title:\s*["']|metadata\s*[:=]/.test(content)
  const hasDescription = /description\s*[:=]\s*["']/.test(content) || /name=["']description["']/.test(content)
  const hasOG = /og:title|openGraph/.test(content)
  if (!hasTitle || !hasDescription || !hasOG) {
    missingMeta.push(`${page} (title:${hasTitle} desc:${hasDescription} og:${hasOG})`)
  }
}

// 2. sitemap / robots
const hasSitemap = existsSync(join(WORKSPACE, "public", "sitemap.xml")) || existsSync(join(WORKSPACE, "sitemap.xml")) || /sitemap/.test(JSON.stringify(pkg.scripts ?? {}))
const hasRobots = existsSync(join(WORKSPACE, "public", "robots.txt")) || existsSync(join(WORKSPACE, "robots.txt")) || /robots/.test(JSON.stringify(pkg.scripts ?? {}))

// 3. URLs semânticas: rotas novas com [id] cru (sem slug)
const idRoutes = newPages.filter((f) => /\[(id|slug|_:?[a-z]+)?\]/.test(f))

const problems: string[] = []
const warnings: string[] = []
for (const m of missingMeta) problems.push(`page missing meta tags: ${m}`)
if (!hasSitemap) warnings.push("no sitemap.xml (public/sitemap.xml or generator script)")
if (!hasRobots) warnings.push("no robots.txt (public/robots.txt or generator script)")
for (const r of idRoutes) warnings.push(`raw-id route (consider semantic slug): ${r}`)

for (const w of warnings) console.log(`seo: WARN ${w}`)
for (const p of problems) console.log(`seo: FAIL ${p}`)
if (problems.length > 0) {
  console.log("seo: FAIL")
  process.exit(1)
}
console.log(`seo: PASS (${warnings.length} warnings, ${newPages.length} new pages checked)`)
process.exit(0)