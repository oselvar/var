import { gherkinDocStrings, gherkinTables } from '@oselvar/bdd'

export default {
  bdds: ['features/**/*.bdd.md'],
  steps: ['steps/**/*.steps.ts'],
  // Opt into Gherkin syntax so the symlinked `library.feature.bdd.md` (a
  // real Gherkin file) parses with the same shape both runners expect:
  // pipe-row tables without a `|---|` separator and `"""` doc strings.
  scannerPlugins: [gherkinTables(), gherkinDocStrings()],
}
