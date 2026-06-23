import type { ScannerPlugin } from './scanner.js'

export type VarConfig = {
  readonly vars: ReadonlyArray<string>
  readonly steps: ReadonlyArray<string>
  readonly snippet: { readonly template: string }
  // Opt-in scanner extensions. Empty by default — projects migrating from
  // Cucumber typically add `[gherkinTables(), gherkinDocStrings()]` here.
  readonly scannerPlugins: ReadonlyArray<ScannerPlugin>
}
