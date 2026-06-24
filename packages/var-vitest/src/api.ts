// The step registration API lives in @oselvar/var-runtime so multiple
// adapters (vitest, the standalone CLI runner, and future bun/deno
// runtimes) all share the same module-scope registry. This file stays as
// a re-export so step files that import from @oselvar/var-vitest don't
// have to change.

export type { Step } from '@oselvar/var-runtime'
export {
  _resetBuilder,
  buildRegistry,
  contextFactory,
  defineContext,
  defineParameterType,
  step,
} from '@oselvar/var-runtime'
