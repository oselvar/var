import type { ScannerPlugin } from '../scanner.js'
import { gherkinDocStrings, gherkinTables } from './gherkin/index.js'

// var.config.json carries scanner plugins as NAME STRINGS (the config is
// shared with the Python/Java/Kotlin ports, which resolve the same names
// against their own implementations). This is the TypeScript resolution
// table. Fixed to the built-ins for now; third-party plugins are out of
// scope (see doc/superpowers/specs/2026-07-02-multi-language-authoring-design.md).
const REGISTRY: Readonly<Record<string, () => ScannerPlugin>> = {
  gherkinTables,
  gherkinDocStrings,
}

export function resolveScannerPlugins(names: ReadonlyArray<string>): ReadonlyArray<ScannerPlugin> {
  return names.map((name) => {
    const factory = Object.hasOwn(REGISTRY, name) ? REGISTRY[name] : undefined
    if (!factory) {
      throw new Error(
        `Unknown scanner plugin "${name}" — known plugins: ${Object.keys(REGISTRY).join(', ')}`,
      )
    }
    return factory()
  })
}
