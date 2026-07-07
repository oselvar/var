// Public entry point for step authors. Intentionally minimal — only `steps`
// (and its `Steps` type). The stateful implementation and the adapter glue live
// in ./internal.js; the glue is exposed separately via @oselvar/var/registry.
export { type Steps, steps } from './internal.ts'
