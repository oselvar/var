// Role-aware TypeScript snippet. Variables:
//   {{role}}         — the active role: context | action | sensor
//   {{altA}},{{altB}}— the two non-active roles (for commented alternatives)
//   {{expression}}   — the cucumber expression, e.g. `I have {int} cukes`
//   {{args}}         — formatted handler args, e.g. `ctx, count: number`
//   {{originalText}} — the raw input the user typed
export const DEFAULT_SNIPPET_TEMPLATE = `// {{altA}}('{{expression}}', ({{args}}) => {})
// {{altB}}('{{expression}}', ({{args}}) => {})
{{role}}('{{expression}}', ({{args}}) => {
  // Write code here that turns the phrase above into concrete actions
  throw new Error('not implemented')
})
`
