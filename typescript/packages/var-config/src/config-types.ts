import type { ScannerPlugin } from '@oselvar/var-core'

// Spec discovery globs. `include` is globbed; anything also matching `exclude`
// is dropped. Both are plain globs — no `!` prefix semantics.
export type VarGlobs = {
  readonly include: ReadonlyArray<string>
  readonly exclude: ReadonlyArray<string>
}

export type VarConfig = {
  readonly vars: VarGlobs
  readonly steps: ReadonlyArray<string>
  readonly snippet: { readonly template?: string }
  // Opt-in scanner extensions. Empty by default — projects migrating from
  // Cucumber typically add `[gherkinTables(), gherkinDocStrings()]` here.
  readonly scannerPlugins: ReadonlyArray<ScannerPlugin>
}
