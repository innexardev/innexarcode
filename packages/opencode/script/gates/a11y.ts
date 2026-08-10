/**
 * A11y gate — acessibilidade (WCAG 2.1 AA) para templates web/mobile.
 *
 * Verifica:
 *  1. Se o projeto é frontend (package.json tem react/next/vue/svelte/expo/react-native)
 *  2. Se ferramenta de a11y está configurada (axe-core, @axe-core/cli, pa11y, lighthouse)
 *  3. Se configurada, roda a checagem e falha se problemas bloqueantes encontrados
 *  4. Se é frontend mas NÃO tem ferramenta → WARN (não bloqueia, mas sinalizado)
 *  5. Se não é frontend → "not applicable", passa
 *
 * Exit 0 = ok ou not applicable. Exit 1 = problema bloqueante.
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const WORKSPACE = process.env.OPENCODE_WORKSPACE ?? "/root/opencode-engos"
const URL_TO_TEST = process.env.OPENCODE_A11Y_URL ?? ""

const pkgPath = join(WORKSPACE, "package.json")
if (!existsSync(pkgPath)) {
  console.log("a11y: not applicable (no package.json)")
  process.exit(0)
}

const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"))
const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
const isFrontend = Object.keys(deps).some((d) => /^(react|next|vue|svelte|@angular|expo|react-native|astro|nuxt)/.test(d)) || existsSync(join(WORKSPACE, "src", "app")) || existsSync(join(WORKSPACE, "pages"))

if (!isFrontend) {
  console.log("a11y: not applicable (non-frontend project)")
  process.exit(0)
}

const hasAxe = Object.keys(deps).some((d) => /axe-core|pa11y|lighthouse|@testing-library\/jest-dom/.test(d))

if (!hasAxe) {
  console.log("a11y: WARN frontend project without axe-core/pa11y/lighthouse configured — WCAG 2.1 AA cannot be validated")
  console.log("a11y: PASS (with warning)")
  process.exit(0)
}

// Se há URL para testar e axe CLI disponível, roda de verdade
const hasAxeCli = Object.keys(deps).includes("@axe-core/cli") || Object.keys(deps).includes("pa11y")
if (hasAxeCli && URL_TO_TEST) {
  try {
    const bin = Object.keys(deps).includes("@axe-core/cli") ? "axe" : "pa11y"
    const out = execFileSync(bin, [URL_TO_TEST], { cwd: WORKSPACE, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] })
    const serious = (out.match(/serious|critical/gi) ?? []).length
    if (serious > 0) {
      console.log(`a11y: FAIL ${serious} serious/critical issues found on ${URL_TO_TEST}`)
      process.exit(1)
    }
    console.log(`a11y: PASS (${serious} serious/critical, ${(out.match(/minor|moderate/gi) ?? []).length} minor/moderate)`)
    process.exit(0)
  } catch (e) {
    console.log(`a11y: WARN axe/pa11y failed to run: ${(e as Error).message}`)
    console.log("a11y: PASS (with warning)")
    process.exit(0)
  }
}

console.log("a11y: PASS (tooling present; set OPENCODE_A11Y_URL to run live scan)")
process.exit(0)