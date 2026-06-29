import type { Diagnostic } from './diagnostics.js'

export interface TestSink {
  example(
    name: string,
    run: () => void | Promise<void>,
    info?: { readonly lines: ReadonlyArray<number> }, // 1-based source lines of the example's steps
  ): void
}

export interface Reporter {
  diagnostic(d: Diagnostic): void
}
