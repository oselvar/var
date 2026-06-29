# @oselvar/var

The package you write step definitions against. Import `defineState`, give it a
factory for your scenario state (and optionally custom parameter types), and use the
returned `context` / `action` / `sensor` functions to bind Cucumber-expression steps.

```ts
import { defineState } from '@oselvar/var'

const { action, sensor } = defineState(() => ({ greeting: '' }))
action('I greet {string}', (_state, name) => ({ greeting: `Hello, ${name}!` }))
sensor('the greeting is {string}', (state) => [state.greeting])
```

This is a thin stateful shell over the pure `@oselvar/var-core`. Adapters use the
`@oselvar/var/registry` subpath for the registry-building glue; step authors never
need it.
