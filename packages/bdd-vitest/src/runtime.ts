import { type Reporter, type TestSink, executePlan, parse, plan } from '@oselvar/bdd'
import { buildRegistry } from './api.js'

export type RunPorts = {
  readonly sink: TestSink
  readonly reporter: Reporter
}

export function runBddSource(source: string, path: string, ports: RunPorts): void {
  const bdd = parse(path, source)
  const registry = buildRegistry()
  const p = plan(bdd, registry)
  executePlan(p, ports)
}
