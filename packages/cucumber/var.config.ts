import { gherkinDocStrings, gherkinTables } from '@oselvar/var-core'

export default {
  // Globs are free-form, so a native Gherkin `.feature` file is a valid spec
  // — no `.md` disguise needed.
  vars: ['features/**/*.feature'],
  steps: ['steps/**/*.steps.ts'],
  // Opt into Gherkin syntax so `library.feature` parses with the same shape
  // both runners expect: pipe-row tables without a `|---|` separator and
  // `"""` doc strings.
  scannerPlugins: [gherkinTables(), gherkinDocStrings()],
}
