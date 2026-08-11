#!/usr/bin/env bun
/**
 * Engineering OS — publish npm (Opção B)
 * Publica o binário compilado + pacote wrapper com postinstall.
 *
 * Uso:
 *   OPENCODE_VERSION=1.18.5 OPENCODE_CHANNEL=latest bun run script/publish-npm.ts
 */
import { $ } from "bun"
import pkg from "../package.json"
import { fileURLToPath } from "url"
import path from "path"

const dir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(dir)

// Nome de publicação configurável: PUBLISH_NAME=opencode-engos
const publishName = process.env.PUBLISH_NAME ?? pkg.name
const version = process.env.OPENCODE_VERSION ?? (() => {
  const [major, minor, patch] = pkg.version.split(".").map(Number)
  return `${major}.${minor}.${patch + 1}`
})()
const channel = process.env.OPENCODE_CHANNEL ?? "latest"

async function published(name: string, ver: string) {
  return (await $`npm view ${name}@${ver} version`.nothrow()).exitCode === 0
}

async function publishPkg(dirPath: string, name: string, ver: string) {
  const abs = path.resolve(dirPath)
  if (process.platform !== "win32") await $`chmod -R 755 .`.cwd(abs)
  if (await published(name, ver)) {
    console.log(`[npm] já publicado ${name}@${ver}`)
    return
  }
  const prev = process.cwd()
  process.chdir(abs)
  try {
    await $`bun pm pack`
    await $`npm publish *.tgz --access public --tag ${channel}`
  } finally {
    process.chdir(prev)
  }
}

// 1. Lê binários gerados pelo build.ts em ./dist/*/package.json
// (exclui o wrapper gerado pelo próprio publish, que não é um binário)
const binaries: Record<string, string> = {}
for (const filepath of new Bun.Glob("*/package.json").scanSync({ cwd: "./dist" })) {
  const dirName = filepath.split("/")[0]
  if (dirName === publishName) continue
  const p = await Bun.file(`./dist/${filepath}`).json()
  // Renomeia o pacote com o prefixo do publishName (ex: opencode-linux-x64 -> opencode-engos-linux-x64)
  // para não colidir com os pacotes do opencode oficial no registry.
  // Só renomeia se ainda não tiver o prefixo (evita opencode-engos-engos-)
  if (p.name.startsWith(`${publishName}-`)) continue
  const renamed = p.name.replace(/^opencode-/, `${publishName}-`)
  if (renamed !== p.name) {
    const orig = `./dist/${dirName}`
    const dest = `./dist/${renamed}`
    await $`rm -rf ${dest}`
    await $`cp -r ${orig} ${dest}`
    p.name = renamed
    await Bun.file(`${dest}/package.json`).write(JSON.stringify(p, null, 2))
  }
  binaries[p.name] = p.version
}
console.log("[npm] binários:", binaries)

if (Object.keys(binaries).length === 0) {
  console.error("Nenhum binário em ./dist. Rode: bun run script/build.ts --single primeiro")
  process.exit(1)
}

const resolvedVersion = Object.values(binaries)[0] ?? version

// 2. Cria o pacote wrapper <name>-ai com postinstall
await $`mkdir -p ./dist/${publishName}`
await $`mkdir -p ./dist/${publishName}/bin`
await $`cp ./script/postinstall.mjs ./dist/${publishName}/postinstall.mjs`

await Bun.file(`./dist/${publishName}/LICENSE`).write(await Bun.file("../../LICENSE").text())

// Placeholder precisa ter o MESMO nome referenciado pelo bin field (bin/opencode.exe),
// senão o npm não cria o symlink .bin na instalação (regressão 1.23.0: placeholder
// era opencode-engos.exe e o .bin ficou ausente).
await Bun.file(`./dist/${publishName}/bin/opencode.exe`).write(
  [
    `echo "Error: ${publishName}-ai's postinstall script was not run." >&2`,
    'echo "" >&2',
    'echo "This occurs when using --ignore-scripts during installation." >&2',
    'echo "" >&2',
    'echo "To fix this, run the postinstall script manually:" >&2',
    `echo "  cd node_modules/${publishName}-ai && node postinstall.mjs" >&2`,
    'echo "" >&2',
    `echo "Or reinstall ${publishName}-ai without the --ignore-scripts flag." >&2`,
    "exit 1",
    "",
  ].join("\n"),
)

await Bun.file(`./dist/${publishName}/package.json`).write(
  JSON.stringify(
    {
      name: `${publishName}-ai`,
      bin: {
        // O postinstall.mjs grava o binário real em bin/opencode.exe
        [publishName]: `./bin/opencode.exe`,
      },
      scripts: {
        postinstall: "node ./postinstall.mjs",
      },
      version: resolvedVersion,
      license: pkg.license,
      os: ["darwin", "linux", "win32"],
      cpu: ["arm64", "x64"],
      optionalDependencies: binaries,
    },
    null,
    2,
  ),
)

// 3. Publica os pacotes de binário + wrapper (SEQUENCIAL — evita conflito staged)
for (const [name, ver] of Object.entries(binaries)) {
  await publishPkg(`./dist/${name}`, name, ver)
}
await publishPkg(`./dist/${publishName}`, `${publishName}-ai`, resolvedVersion)

console.log(`[npm] Publicação concluída: ${publishName}-ai@${resolvedVersion} (channel: ${channel})`)
