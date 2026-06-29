// Adapter-only glue: build the immutable Registry from the module-scope
// registrations, supply per-stepfile context factories, and reset between runs.
// Kept on a separate entry point so step authors importing the package root see
// only the authoring API.
export { _resetBuilder, buildRegistry, contextFactory } from './internal.js'
