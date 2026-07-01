import { buildRegistry, contextFactory } from '@oselvar/var/registry'
import {
  type ExampleResult,
  executePlan,
  hashSource,
  parse,
  plan,
  type SpecResults,
  type TestSink,
  toFailure,
} from '@oselvar/var-core'

export async function runRegisteredSpec(
  varPath: string,
  varSource: string,
  exampleIndex?: number,
): Promise<SpecResults> {
  const registry = buildRegistry()
  const varDoc = parse(varPath, varSource, [])
  const full = plan(varDoc, registry)
  const examples =
    exampleIndex == null ? full.examples : full.examples.filter((_, i) => i === exampleIndex)
  const toRun = { ...full, examples }

  const out: ExampleResult[] = new Array(examples.length)
  const pending: Promise<void>[] = []
  let i = 0
  const createContext = contextFactory()
  const sink: TestSink = {
    example(name, run) {
      const idx = i++
      // biome-ignore lint/style/noNonNullAssertion: example() is invoked once per examples entry, so idx is in range
      const ex = examples[idx]!
      const lines = [...new Set(ex.steps.map((s) => s.matchSpan.startLine))]
      pending.push(
        (async () => {
          try {
            await run()
            out[idx] = { name, status: 'passed', lines }
          } catch (err) {
            out[idx] = {
              name,
              status: 'failed',
              lines,
              failure: toFailure(err, varPath, lines[0] ?? 0),
            }
          }
        })(),
      )
    },
  }

  executePlan(toRun, { sink, reporter: { diagnostic() {} }, createContext })
  await Promise.all(pending)
  return { version: 1, specPath: varPath, sourceHash: hashSource(varSource), examples: out }
}
