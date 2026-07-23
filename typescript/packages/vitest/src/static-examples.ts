import { buildWorkspaceIndex, createTreeSitterScanner, type StepDefScanner } from '@varar/language'
import { planSpec } from '@varar/runner'
import { createNodeGrammarLoader } from './node-grammar-loader.ts'

// The tree-sitter scanner is created once and reused across every spec the
// plugin transforms: Parser.init and grammar loading are async and would
// otherwise repeat per file. createTreeSitterScanner caches dialects per
// loader, so reusing one loader keeps the grammar wasm loaded once.
let scannerPromise: Promise<StepDefScanner> | undefined
function stepDefScanner(): Promise<StepDefScanner> {
  scannerPromise ??= createTreeSitterScanner(createNodeGrammarLoader())
  return scannerPromise
}

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
}

// Build-time twin of the runtime plan: statically scan the step sources
// (tree-sitter — no step code is executed) into a registry of expressions,
// then plan the spec against it. Matching depends only on expressions and
// parameter types, never on handlers, so the example list — names, order,
// spans — is the same one the runtime produces. Step defs the scanner cannot
// see (built dynamically at runtime) surface through the generated module's
// stale-transform guard instead of silently diverging.
export async function discoverStaticExamples(
  input: DiscoverInput,
): Promise<ReadonlyArray<StaticExample>> {
  const scanner = await stepDefScanner()
  const { registry } = buildWorkspaceIndex({
    stepFiles: input.stepFiles,
    varFiles: [],
    scanner,
  })
  const p = planSpec(input.varPath, input.source, registry)
  return p.examples.map((ex) => ({
    name: ex.name,
    line: ex.span.startLine,
    col: ex.span.startCol,
  }))
}
