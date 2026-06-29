import {
  executePlan,
  parse,
  plan,
  type Reporter,
  type ScannerPlugin,
  type TestSink,
  toFailure,
} from '@oselvar/var-core'
import { buildRegistry, contextFactory } from '@oselvar/var-runtime/registry'

export { toFailure }

export type RunPorts = {
  readonly sink: TestSink
  readonly reporter: Reporter
  // Opt-in scanner plugins (e.g. Gherkin tables, Gherkin doc strings) that
  // the var-vitest plugin forwards from var.config.ts.
  readonly scannerPlugins?: ReadonlyArray<ScannerPlugin>
}

export function runVarSource(source: string, path: string, ports: RunPorts): void {
  const varDoc = parse(path, source, ports.scannerPlugins ?? [])
  const registry = buildRegistry()
  const p = plan(varDoc, registry)
  executePlan(p, { ...ports, createContext: contextFactory() })
}
