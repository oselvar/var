import type { Diagnostic } from './diagnostics.js'

export interface TestSink {
  example(name: string, run: () => void | Promise<void>): void
}

export interface Reporter {
  diagnostic(d: Diagnostic): void
}
