import * as varCore from '@oselvar/var'
import { hashSource, type SpecResults } from '@oselvar/var'
import * as varRuntime from '@oselvar/var-runtime'
import * as ts from 'typescript'
import { runRegisteredSpec } from './run-spec.ts'

type RunInput = {
  varPath: string
  varSource: string
  stepFiles: ReadonlyArray<{ path: string; source: string }>
  exampleIndex?: number
}

function evalStepFile(path: string, source: string): void {
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: path,
  }).outputText
  const require = (spec: string): unknown => {
    if (spec === '@oselvar/var-runtime' || spec === '@oselvar/var-vitest') return varRuntime
    if (spec === '@oselvar/var') return varCore
    throw new Error(
      `Cannot import "${spec}" in the browser runner — import action()/context()/sensor()/defineState() from "@oselvar/var-runtime".`,
    )
  }
  const mod = { exports: {} as Record<string, unknown> }
  // `//# sourceURL` makes var-runtime's stack-based callerLocation see the real path.
  new Function('require', 'exports', 'module', `${js}\n//# sourceURL=${path}`)(
    require,
    mod.exports,
    mod,
  )
}

self.onmessage = async (e: MessageEvent<RunInput>) => {
  const input = e.data
  let results: SpecResults
  try {
    varRuntime._resetBuilder()
    for (const f of input.stepFiles) evalStepFile(f.path, f.source)
    results = await runRegisteredSpec(input.varPath, input.varSource, input.exampleIndex)
  } catch (err) {
    const e2 = err as Error
    results = {
      version: 1,
      specPath: input.varPath,
      sourceHash: hashSource(input.varSource),
      examples: [
        {
          name: 'run error',
          status: 'failed',
          lines: [1],
          failure: {
            line: 1,
            message: e2?.message ?? String(err),
            stack: e2?.stack ?? String(err),
          },
        },
      ],
    }
  }
  ;(self as unknown as Worker).postMessage(results)
}
