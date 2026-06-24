#!/usr/bin/env node
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'packages', 'var-vscode')
const NAME = 'oselvar.oselvar-var-0.0.0'
const TARGETS = [
  join(homedir(), '.vscode', 'extensions', NAME),
  join(homedir(), '.cursor', 'extensions', NAME),
]
// Stable UUID for the local dev install. The editor cares that it's unique
// across the registry, not that it matches a marketplace identity.
const EXTENSION_UUID = 'f8c1c5e4-7d30-4b9d-bdd0-7d30c4b9d050'
const PUBLISHER_UUID = 'f8c1c5e4-7d30-4b9d-bdd0-7d30c4b9d051'

for (const DST of TARGETS) {
  if (existsSync(DST) || isBrokenSymlink(DST)) {
    rmSync(DST, { recursive: true, force: true })
  }
  mkdirSync(dirname(DST), { recursive: true })
  symlinkSync(SRC, DST, 'dir')
  // biome-ignore lint/suspicious/noConsole: dev script
  console.log(`linked: ${DST} → ${SRC}`)
  // The editor tracks uninstalled extensions in `.obsolete`; that flag wins
  // over the symlink, so clear our entry on every (re)install.
  clearObsoleteFlag(join(dirname(DST), '.obsolete'), NAME)
  // After UI-uninstall, the extension is also removed from `extensions.json`
  // (the registry). Re-register so the editor treats it as installed.
  registerExtension(join(dirname(DST), 'extensions.json'), DST, NAME)
}
// biome-ignore lint/suspicious/noConsole: dev script
console.log('Reload the editor (Cmd+Shift+P → "Reload Window") to pick up the extension.')

function isBrokenSymlink(p) {
  try {
    return lstatSync(p).isSymbolicLink() && !existsSync(p)
  } catch {
    return false
  }
}

function registerExtension(jsonPath, dstPath, name) {
  let data = []
  if (existsSync(jsonPath)) {
    try {
      data = JSON.parse(readFileSync(jsonPath, 'utf8'))
    } catch {
      // biome-ignore lint/suspicious/noConsole: dev script
      console.log(`warning: ${jsonPath} is not valid JSON; skipping registration`)
      return
    }
    if (!Array.isArray(data)) return
  }
  const id = 'oselvar.oselvar-var'
  const filtered = data.filter((e) => e?.identifier?.id !== id)
  filtered.push({
    identifier: { id, uuid: EXTENSION_UUID },
    version: '0.0.0',
    location: { $mid: 1, path: dstPath, scheme: 'file' },
    relativeLocation: name,
    metadata: {
      id: EXTENSION_UUID,
      publisherId: PUBLISHER_UUID,
      publisherDisplayName: 'oselvar',
      targetPlatform: 'undefined',
      updated: false,
      isPreReleaseVersion: false,
      installedTimestamp: 0,
      preRelease: false,
    },
  })
  writeFileSync(jsonPath, JSON.stringify(filtered))
  // biome-ignore lint/suspicious/noConsole: dev script
  console.log(`registered ${id} in ${jsonPath}`)
}

function clearObsoleteFlag(obsoletePath, name) {
  if (!existsSync(obsoletePath)) return
  let data
  try {
    data = JSON.parse(readFileSync(obsoletePath, 'utf8'))
  } catch {
    return
  }
  if (!data || typeof data !== 'object' || !(name in data)) return
  delete data[name]
  writeFileSync(obsoletePath, JSON.stringify(data))
  // biome-ignore lint/suspicious/noConsole: dev script
  console.log(`cleared .obsolete entry for ${name} in ${obsoletePath}`)
}
