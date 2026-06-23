import {
  type Reporter,
  type ScannerPlugin,
  type TestSink,
  executePlan,
  parse,
  plan,
} from '@oselvar/bdd'
import { buildRegistry, contextFactory } from '@oselvar/bdd-runtime'

export type RunPorts = {
  readonly sink: TestSink
  readonly reporter: Reporter
  // Opt-in scanner plugins (e.g. Gherkin tables, Gherkin doc strings) that
  // the bdd-vitest plugin forwards from bdd.config.ts.
  readonly scannerPlugins?: ReadonlyArray<ScannerPlugin>
}

export function runBddSource(source: string, path: string, ports: RunPorts): void {
  const bdd = parse(path, source, ports.scannerPlugins ?? [])
  const registry = buildRegistry()
  const p = plan(bdd, registry)
  executePlan(p, { ...ports, createContext: contextFactory() })
}
