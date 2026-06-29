import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { type ExampleResult, hashSource, type SpecResults } from '@oselvar/var-core'
import type { Reporter, TestModule } from 'vitest/node'

// Structural shape of the slice of vitest's TestModule API the collector reads.
// `meta()` is typed `unknown` so both vitest's real `TestModule` (whose
// `meta()` returns the augmentation-free `TaskMeta`) and the plain test fakes
// satisfy it without a module augmentation — the plugin stashes each example's
// result on `ctx.task.meta.varResult`, which we narrow when reading.
type TestCaseNode = {
  meta(): unknown
}
type TestModuleNode = {
  readonly moduleId: string
  readonly children: { allTests(): Iterable<TestCaseNode> }
}

// Group every test's meta.varResult by its owning spec module, in declaration
// order. Modules that produced no var results (e.g. only var:diagnostic tasks)
// are skipped.
export function collectFromModules(
  testModules: ReadonlyArray<TestModuleNode>,
): ReadonlyMap<string, ReadonlyArray<ExampleResult>> {
  const byFile = new Map<string, ExampleResult[]>()
  for (const m of testModules) {
    const examples: ExampleResult[] = []
    for (const tc of m.children.allTests()) {
      const varResult = (tc.meta() as { varResult?: ExampleResult } | null | undefined)?.varResult
      if (varResult) examples.push(varResult)
    }
    if (examples.length > 0) byFile.set(m.moduleId, examples)
  }
  return byFile
}

// Absolute filepath → POSIX spec path relative to cwd.
export function toSpecPath(filepath: string, cwd: string): string {
  const rel = isAbsolute(filepath) ? relative(cwd, filepath) : filepath
  return rel.split(sep).join('/')
}

// Spec path → its result file under .var/.
export function resultFilePath(specPath: string, cwd: string): string {
  return join(cwd, '.var', `${specPath}.json`)
}

export function buildSpecResults(
  specPath: string,
  source: string,
  examples: ReadonlyArray<ExampleResult>,
): SpecResults {
  return { version: 1, specPath, sourceHash: hashSource(source), examples }
}

export type VarResultsReporterOptions = { readonly cwd?: string }

// Vitest reporter (the only side-effecting piece). Reads each spec's source,
// hashes it, and writes .var/<spec>.json. Registry-free: every ExampleResult
// arrives prebuilt on task.meta from the worker.
export class VarResultsReporter implements Reporter {
  private readonly cwd: string
  constructor(options: VarResultsReporterOptions = {}) {
    this.cwd = options.cwd ?? process.cwd()
  }

  private writeResults(byFile: ReadonlyMap<string, ReadonlyArray<ExampleResult>>): void {
    for (const [filepath, examples] of byFile) {
      const specPath = toSpecPath(filepath, this.cwd)
      const source = readFileSync(filepath, 'utf8')
      const results = buildSpecResults(specPath, source, examples)
      const out = resultFilePath(specPath, this.cwd)
      mkdirSync(dirname(out), { recursive: true })
      writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`)
    }
  }

  // Reporter hook (TestModule API). Called after all tests finish. vitest's
  // `TestModule` structurally satisfies the `TestModuleNode` the pure collector
  // consumes.
  onTestRunEnd(testModules: ReadonlyArray<TestModule> = []): void {
    this.writeResults(collectFromModules(testModules))
  }
}
