export type ExampleResult = {
  readonly name: string
  readonly status: 'passed' | 'failed'
  readonly lines: ReadonlyArray<number> // 1-based source lines of this example's steps
  readonly failure?: { readonly line: number; readonly message: string; readonly stack: string }
}
export type RunResults = { readonly examples: ReadonlyArray<ExampleResult> }
