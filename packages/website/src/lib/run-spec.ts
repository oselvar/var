import {
  executePlan,
  isCellMismatchError,
  isDocStringMismatchError,
  parse,
  plan,
  type TestSink,
} from '@oselvar/var'
import { buildRegistry, contextFactory } from '@oselvar/var-runtime'
import type { ExampleResult, RunResults } from './run-types.ts'

// Parse the `<varPath>:line:col` frame `executePlan` injects to find the failing line.
function failingLine(stack: string, varPath: string): number | undefined {
  const re = new RegExp(`${varPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:(\\d+):\\d+`)
  const m = re.exec(stack)
  return m ? Number(m[1]) : undefined
}

export async function runRegisteredSpec(
  varPath: string,
  varSource: string,
  exampleIndex?: number,
): Promise<RunResults> {
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
            const e = err as Error
            const stack = e?.stack ?? String(err)
            const cells = isCellMismatchError(err)
              ? err.cells
                  .filter((c) => !c.ok)
                  .map((c) => ({
                    from: c.span.startOffset,
                    to: c.span.endOffset,
                    actual: c.actual,
                  }))
              : undefined
            const doc = isDocStringMismatchError(err)
              ? {
                  from: err.diff.span.startOffset,
                  to: err.diff.span.endOffset,
                  actual: err.diff.actual,
                }
              : undefined
            out[idx] = {
              name,
              status: 'failed',
              lines,
              failure: {
                line: failingLine(stack, varPath) ?? lines[0] ?? 0,
                message: e?.message ?? String(err),
                stack,
                ...(cells?.length && { cells }),
                ...(doc && { doc }),
              },
            }
          }
        })(),
      )
    },
  }

  executePlan(toRun, { sink, reporter: { diagnostic() {} }, createContext })
  await Promise.all(pending)
  return { examples: out }
}
