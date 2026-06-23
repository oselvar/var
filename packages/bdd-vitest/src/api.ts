// The step registration API lives in @oselvar/bdd-runtime so multiple
// adapters (vitest, the standalone CLI runner, and future bun/deno
// runtimes) all share the same module-scope registry. This file stays as
// a re-export so step files that import from @oselvar/bdd-vitest don't
// have to change.
export {
  step,
  defineContext,
  defineParameterType,
  buildRegistry,
  contextFactory,
  _resetBuilder,
} from '@oselvar/bdd-runtime'
export type { Step } from '@oselvar/bdd-runtime'
