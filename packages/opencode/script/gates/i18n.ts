/**
 * i18n gate — i18n/l10n readiness para templates web/mobile.
 *
 * Verifica:
 *  1. Projeto é frontend? (react/next/vue/svelte/expo/react-native)
 *  2. Tem biblioteca i18n configurada? (i18next, react-i18next, next-intl,
 *     react-intl, vue-i18n, @lingui, expo-localization, @formatjs)
 *  3. Frontend sem i18n + diff adiciona componentes/UI nova → WARN (não bloqueia)
 *  4. Não-frontend → not applicable
 *
 * Exit 0 sempre (WARN informativo). Strings hardcoded são decisão de produto,
 * não erro de build — mas o aviso impede esquecimento silencioso.
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const WORKSPACE = process.env.OPENCODE_WORKSPACE ?? "/root/opencode-engos"
const BASE = process.env.OPENCODE_BASE_BRANCH ?? "dev"

const I18N_LIBS = ["i18next", "react-i18next", "next-intl", "react-intl", "vue-i18n", "@lingui", "expo-localization", "@formatjs", "i18n-js"]

const pkgPath = join(WORKSPACE, "package.json")
if (!existsSync(pkgPath)) {
  console.log("i18n: not applicable (no package.json)")
  process.exit(0)
}

const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"))
const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
const isFrontend = Object.keys(deps).some((d) => /^(react|next|vue|svelte|@angular|expo|react-native|astro|nuxt)/.test(d)) || existsSync(join(WORKSPACE, "src", "app")) || existsSync(join(WORKSPACE, "pages"))

if (!isFrontend) {
  console.log("i18n: not applicable (non-frontend project)")
  process.exit(0)
}

const hasI18n = Object.keys(deps).some((d) => I18N_LIBS.some((lib) => d === lib || d.startsWith(`${lib}/`)))

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
let newUiFiles: string[] = []
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
  newUiFiles = [...new Set(out)].filter((f) => /\.(tsx|jsx|vue|svelte)$/.test(f) && !f.includes(".test.") && !f.includes("node_modules"))
}

if (hasI18n) {
  console.log(`i18n: PASS (${I18N_LIBS.filter((l) => Object.keys(deps).some((d) => d === l || d.startsWith(`${l}/`))).join(", ")})`)
  process.exit(0)
}

if (newUiFiles.length > 0) {
  console.log(`i18n: WARN frontend sem biblioteca i18n, ${newUiFiles.length} arquivos de UI novos no diff:`)
  for (const f of newUiFiles.slice(0, 8)) console.log(`i18n:   ${f}`)
  console.log("i18n: WARN strings hardcoded sem suporte a tradução — adote i18next/next-intl/react-intl para produtos")
  process.exit(0)
}

console.log("i18n: WARN frontend sem biblioteca i18n (sem UI nova neste diff)")
console.log("i18n: PASS (with warning)")
process.exit(0)