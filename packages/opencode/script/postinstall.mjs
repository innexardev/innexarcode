#!/usr/bin/env node

import childProcess from "child_process"
import fs from "fs"
import os from "os"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Detect platform
const platform = os.platform() === "darwin" ? "darwin" : os.platform() === "win32" ? "windows" : "linux"
const arch = os.arch() === "x64" ? "x64" : os.arch() === "arm64" ? "arm64" : os.arch()
const isMusl = platform === "linux" && (fs.existsSync("/etc/alpine-release") || (() => {
  try { return `${childProcess.spawnSync("ldd", ["--version"], {encoding:"utf8"}).stdout || ""}`.toLowerCase().includes("musl") } catch { return false }
})())
const supportsAvx2 = arch === "x64" && (() => {
  if (platform === "linux") { try { return /(^|\s)avx2(\s|$)/i.test(fs.readFileSync("/proc/cpuinfo", "utf8")) } catch { return false } }
  if (platform === "darwin") { try { const r = childProcess.spawnSync("sysctl", ["-n","hw.optional.avx2_0"], {encoding:"utf8",timeout:1500}); return r.status === 0 && r.stdout.trim() === "1" } catch { return false } }
  return false
})()

// Determine package names to try (in priority order)
const base = `opencode-engos-${platform}-${arch}`
const names = []
if (platform === "linux") {
  if (isMusl) {
    if (arch === "x64" && !supportsAvx2) {
      names.push(`${base}-baseline-musl`, `${base}-musl`, `${base}-baseline`)
    } else {
      names.push(`${base}-musl`, base)
    }
  } else {
    if (arch === "x64" && !supportsAvx2) {
      names.push(`${base}-baseline`, base)
    } else {
      names.push(base)
    }
  }
} else if (arch === "x64") {
  if (!supportsAvx2) {
    names.push(`${base}-baseline`, base)
  } else {
    names.push(base)
  }
} else {
  names.push(base)
}

// Source binary name inside the platform package
const sourceBinary = platform === "windows" ? "opencode.exe" : "opencode"
// Target always uses the name referenced by the wrapper's bin field (bin/opencode.exe)
const targetBinary = path.join(__dirname, "bin", "opencode.exe")
const targetBinDir = path.dirname(targetBinary)

// Try to find binary from an installed package
function findBinary(pkgName) {
  // Common global node_modules locations
  const searchPaths = [
    __dirname,
    path.dirname(__dirname),
    "/usr/local/lib/node_modules",
    "/usr/lib/node_modules",
    path.join(os.homedir(), ".npm-global/lib/node_modules"),
  ]
  for (const dir of searchPaths) {
    const nodeModulesPath = path.join(dir, "node_modules")
    log(`  scanning ${nodeModulesPath} for ${pkgName}`)
    if (!fs.existsSync(nodeModulesPath)) {
      log(`    not found`)
      continue
    }
    const entries = fs.readdirSync(nodeModulesPath, {withFileTypes: true})
    log(`    contents: ${entries.map(e => e.name).join(", ")}`)
    const binPath = path.join(dir, "node_modules", pkgName, "bin", sourceBinary)
    log(`    checking ${binPath} -> ${fs.existsSync(binPath)}`)
    if (fs.existsSync(binPath)) return binPath
  }
  return null
}

// Install package to temp dir and return binary path
function installAndGetBinary(pkgName, version) {
  const installTarget = `${pkgName}@${version}`
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-"))
  log(`  npm install --prefix ${temp} ${installTarget}`)
  try {
    const r = childProcess.spawnSync("npm", ["install", "--ignore-scripts", "--no-save", "--loglevel=verbose", "--prefix", temp, installTarget], {stdio: "pipe", encoding: "utf8", windowsHide: true})
    log(`  npm exit code: ${r.status}`)
    if (r.status !== 0) return null

    // Try expected path first
    let binPath = path.join(temp, "node_modules", pkgName, "bin", sourceBinary)
    log(`  looking for binary at: ${binPath}, exists: ${fs.existsSync(binPath)}`)

    // If not found, npm might have hoisted to a parent node_modules
    if (!fs.existsSync(binPath)) {
      log(`  binary not at expected path, searching...`)
      // Search in parent node_modules up to / (bounded to avoid infinite loop)
      let searchDir = path.join(temp, "node_modules")
      while (searchDir && searchDir !== "/") {
        try {
          const entries = fs.readdirSync(searchDir, {withFileTypes: true})
          const found = entries.find(e => e.name === pkgName)
          if (found) {
            binPath = path.join(searchDir, pkgName, "bin", sourceBinary)
            log(`  found hoisted at ${binPath}, exists: ${fs.existsSync(binPath)}`)
            break
          }
        } catch {}
        const parent = path.dirname(searchDir)
        if (parent === searchDir) break
        searchDir = parent
      }
      // Also check /usr/lib/node_modules directly (global install case)
      if (!fs.existsSync(binPath)) {
        const globalPath = path.join("/usr/lib/node_modules", pkgName, "bin", sourceBinary)
        log(`  checking global /usr/lib/node_modules: ${globalPath}, exists: ${fs.existsSync(globalPath)}`)
        if (fs.existsSync(globalPath)) binPath = globalPath
      }
    }

    if (!fs.existsSync(binPath)) {
      log(`  binary still not found after search`)
      return null
    }
    // Copy binary to target
    fs.mkdirSync(targetBinDir, {recursive: true})
    if (fs.existsSync(targetBinary)) fs.unlinkSync(targetBinary)
    fs.copyFileSync(binPath, targetBinary)
    fs.chmodSync(targetBinary, 0o755)
    log(`  copied to ${targetBinary}`)
    return targetBinary
  } finally {
    fs.rmSync(temp, {recursive:true, force:true})
  }
}

// Verify binary works
function isValidBinary(binPath) {
  try {
    log(`  isValidBinary: trying ${binPath}`)
    const r = childProcess.spawnSync(binPath, ["--version"], {stdio:"ignore", encoding:"utf8", windowsHide:true, timeout:5000})
    log(`  isValidBinary: exit=${r.status} signal=${r.signal}`)
    return r.status === 0
  } catch(e) {
    log(`  isValidBinary ERROR: ${e.message}`)
    return false
  }
}

function createSymlinks() {
  if (platform === "win32") return
  for (const symlink of ["/usr/local/bin/innexarcode", "/usr/bin/innexarcode"]) {
    try {
      fs.mkdirSync(path.dirname(symlink), {recursive:true})
      if (fs.existsSync(symlink)) fs.unlinkSync(symlink)
      fs.symlinkSync(targetBinary, symlink)
      fs.chmodSync(symlink, 0o755)
    } catch {}
  }
}

function log(...args) {
  const msg = args.join(" ")
  fs.appendFileSync("/tmp/postinstall.log", msg + "\n")
  console.error(msg)
}

function main() {
  // Debug: log environment to file
  log(`=== postinstall start ===`)
  log(`platform=${platform} arch=${arch} isMusl=${isMusl} supportsAvx2=${supportsAvx2}`)
  log(`names=${JSON.stringify(names)}`)
  log(`__dirname=${__dirname}`)
  log(`targetBinary=${targetBinary}`)
  log(`parent dir (dirname __dirname) = ${path.dirname(__dirname)}`)

  // List what's actually in the parent node_modules
  const parentNm = path.join(path.dirname(__dirname), "node_modules")
  log(`parent node_modules = ${parentNm}`)
  if (fs.existsSync(parentNm)) {
    try {
      const entries = fs.readdirSync(parentNm, {withFileTypes: true})
      log(`parent node_modules entries: ${entries.map(e => e.name).join(", ")}`)
    } catch(e) { log(`could not read parent node_modules: ${e.message}`) }
  } else {
    log(`parent node_modules does not exist`)
  }

  // 1. Try to find already-installed binary from any known package name
  for (const name of names) {
    const binPath = findBinary(name)
    log(`findBinary(${name}) = ${binPath}`)
    if (binPath) {
      // Copy first regardless of isValidBinary result, then validate the copy
      fs.mkdirSync(targetBinDir, {recursive:true})
      if (fs.existsSync(targetBinary)) fs.unlinkSync(targetBinary)
      fs.copyFileSync(binPath, targetBinary)
      fs.chmodSync(targetBinary, 0o755)
      log(`  copied ${binPath} -> ${targetBinary}`)
      if (isValidBinary(targetBinary)) {
        log(`SUCCESS: binary verified`)
        createSymlinks()
        return
      }
      // If copy is invalid, remove it and continue to install
      log(`  copy failed validation, trying install`)
      fs.unlinkSync(targetBinary)
    }
  }

  // 2. Install the latest published binary from npm
  for (const name of names) {
    let version = "latest"
    try {
      const r = childProcess.spawnSync("npm", ["view", name, "version"], {encoding:"utf8", windowsHide:true, timeout:20000})
      if (r.status === 0 && r.stdout.trim()) version = r.stdout.trim()
    } catch {}
    log(`installAndGetBinary(${name}, ${version})`)
    const bin = installAndGetBinary(name, version)
    log(`  result: ${bin}`)
    if (bin && isValidBinary(bin)) {
      log(`SUCCESS: installed and verified`)
      createSymlinks()
      return
    }
  }

  // 3. Fallback
  let pkgJson
  try {
    const pkgPath = fs.existsSync(path.join(__dirname, "package.json")) ? path.join(__dirname, "package.json") : path.join(__dirname, "..", "package.json")
    pkgJson = JSON.parse(fs.readFileSync(pkgPath, "utf8"))
  } catch {}
  const deps = pkgJson?.optionalDependencies || {}
  log(`fallback optionalDeps=${JSON.stringify(deps)}`)
  for (const [name, version] of Object.entries(deps)) {
    if (names.some(n => name.startsWith(n.split("-").slice(0,3).join("-")))) {
      log(`trying dep ${name}@${version}`)
      const bin = installAndGetBinary(name, version)
      if (bin && isValidBinary(bin)) {
        log(`SUCCESS: fallback worked`)
        createSymlinks()
        return
      }
    }
  }

  log(`FAILED: tried ${names.join(", ")}`)
  process.exit(1)
}

try {
  main()
} catch (err) {
  console.error(err.message)
  process.exit(1)
}
