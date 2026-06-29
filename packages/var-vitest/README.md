# @oselvar/var-vitest

The vitest adapter for Vár. Wire the plugin into your `vitest.config.ts` so `.var.md`
files run as tests, and add the results reporter:

```ts
import varPlugin from '@oselvar/var-vitest'
import { VarResultsReporter } from '@oselvar/var-vitest/reporter'

export default { plugins: [varPlugin()], test: { reporters: ['default', new VarResultsReporter()] } }
```

Write your step definitions against `@oselvar/var`, not this package.
