import type { ScannerPlugin } from '@oselvar/var-core'
import { buildWorkspaceIndex } from '@oselvar/var-language'
import { planSpec } from '@oselvar/var-runner'

export type StaticExample = {
  readonly name: string
  // 1-based start line/column of the example in the markdown source. The
  // generated virtual module places the example's `test(...)` call at exactly
  // this position so runtime stack traces and editor AST discovery both land
  // on the right spec line without a source map.
  readonly line: number
  readonly col: number
}

export type DiscoverInput = {
  readonly varPath: string
  readonly source: string
  readonly stepFiles: ReadonlyArray<{ readonly path: string; readonly source: string }>
  readonly scannerPlugins?: ReadonlyArray<ScannerPlugin>
}

// Build-time twin of the runtime plan: statically scan the step sources
// (TypeScript compiler AST — no step code is executed) into a registry of
// expressions, then plan the spec against it. Matching depends only on
// expressions and parameter types, never on handlers, so the example list —
// names, order, spans — is the same one the runtime produces. Step defs the
// scanner cannot see (built dynamically at runtime) surface through the
// generated module's stale-transform guard instead of silently diverging.
export function discoverStaticExamples(input: DiscoverInput): ReadonlyArray<StaticExample> {
  const { registry } = buildWorkspaceIndex({ stepFiles: input.stepFiles, varFiles: [] })
  const p = planSpec(input.varPath, input.source, registry, input.scannerPlugins)
  return p.examples.map((ex) => ({
    name: ex.name,
    line: ex.span.startLine,
    col: ex.span.startCol,
  }))
}
