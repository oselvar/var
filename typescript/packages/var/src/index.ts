// Public entry point for step authors. Intentionally minimal — only
// defineState. The stateful implementation and the adapter glue live in
// ./internal.js; the glue is exposed separately via @oselvar/var/registry.
export { defineState } from './internal.js'
