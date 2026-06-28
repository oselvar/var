export type CellFailure = {
  readonly from: number // source offset of the EXPECTED cell text (== CodeMirror position)
  readonly to: number
  readonly actual: string // the runtime value the step produced
}
export type ExampleResult = {
  readonly name: string
  readonly status: 'passed' | 'failed'
  readonly lines: ReadonlyArray<number> // 1-based source lines of this example's steps
  readonly failure?: {
    readonly line: number
    readonly message: string
    readonly stack: string
    readonly cells?: ReadonlyArray<CellFailure> // table / header-bound row cell mismatches
    readonly doc?: CellFailure // doc-string body mismatch (single span)
  }
}
export type RunResults = { readonly examples: ReadonlyArray<ExampleResult> }
