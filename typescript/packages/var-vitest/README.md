# @varar/vitest

The vitest adapter for Varar. Wire the plugin into your `vitest.config.ts` so `.md`
files run as tests, and add the results reporter:

```ts
import varPlugin from '@varar/vitest'
import { VarResultsReporter } from '@varar/vitest/reporter'

export default { plugins: [varPlugin()], test: { reporters: ['default', new VarResultsReporter()] } }
```

Write your step definitions against `@varar/varar`, not this package.
