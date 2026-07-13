# @oselvar/var-vitest

The vitest adapter for Vár. Wire the plugin into your `vitest.config.ts` so `.md`
files run as tests, and add the results reporter:

```ts
import varPlugin from '@oselvar/var-vitest'
import { VarResultsReporter } from '@oselvar/var-vitest/reporter'

export default { plugins: [varPlugin()], test: { reporters: ['default', new VarResultsReporter()] } }
```

Write your step definitions against `@oselvar/var`, not this package.

## External consumers on strict `node_modules` layouts

The plugin dedupes `@oselvar/var` and `@oselvar/var-core` to a single instance
each, resolved from your project root. The generated virtual test module (its id
is the spec file's path) reaches `@oselvar/var-core` through
`@oselvar/var-vitest/runtime`, so `@oselvar/var-core` must be resolvable from the
package that holds your specs. It is a transitive dependency of both
`@oselvar/var` and `@oselvar/var-vitest`; hoisting installers surface it for you,
but under a strict layout (pnpm, Yarn PnP) add it explicitly:

```bash
pnpm add -D @oselvar/var-core
```
