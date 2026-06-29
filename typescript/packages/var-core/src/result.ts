// A doc-string / cell mismatch as a source-offset range plus the runtime value.
// `from`/`to` are absolute source offsets (== CodeMirror positions); `to` is
// exclusive.
export type CellFailure = {
  readonly from: number
  readonly to: number
  readonly actual: string
}

export type ExampleResult = {
  readonly name: string
  readonly status: 'passed' | 'failed'
  // 1-based source lines of this example's steps (the line-wash anchors).
  readonly lines: ReadonlyArray<number>
  readonly failure?: {
    readonly line: number
    readonly message: string
    readonly stack: string
    readonly cells?: ReadonlyArray<CellFailure> // table / header-bound row mismatches
    readonly doc?: CellFailure // doc-string body mismatch (single span)
  }
}

// The persisted run result for one spec file. The `.var/<spec>.json` file IS a
// serialized SpecResults.
export type SpecResults = {
  readonly version: 1
  readonly specPath: string // POSIX separators, relative to cwd
  readonly sourceHash: string // hashSource(spec source) at run time
  readonly examples: ReadonlyArray<ExampleResult>
}
