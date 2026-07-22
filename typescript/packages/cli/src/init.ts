import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const CONFIG = `{
  "docs": { "include": ["varar-examples/**/*.md"], "exclude": [] },
  "steps": ["varar-examples/**/*.steps.ts"]
}
`

const EXAMPLE_MD = `# Deep Thought

You're really not going to like it.

The answer to the great question of life, the universe and everything is 42.

It was a tough assignment.
`

const EXAMPLE_STEPS = `import { steps } from '@varar/varar'

const { sensor } = steps()

sensor('life, the universe and everything is {int}', () => 42)
`

export type InitOptions = {
  readonly cwd: string
  readonly writeStdout: (s: string) => void
}

export type InitResult = { readonly exitCode: number }

// The scaffolded step file is an ES module (`import { steps } …`), so Node only
// loads it when the nearest package.json says `"type": "module"`. Add it when
// the field is absent, but never rewrite a `type` the project already chose —
// that is the project's decision, and flipping it would break its other files.
function ensureEsm(cwd: string, writeStdout: (s: string) => void): void {
  const target = join(cwd, 'package.json')
  if (!existsSync(target)) {
    writeFileSync(target, `${JSON.stringify({ type: 'module' }, null, 2)}\n`)
    writeStdout('created package.json (type: module)\n')
    return
  }
  let pkg: Record<string, unknown>
  try {
    pkg = JSON.parse(readFileSync(target, 'utf8')) as Record<string, unknown>
  } catch {
    writeStdout('skipped package.json (not valid JSON) — add "type": "module" yourself\n')
    return
  }
  if (pkg.type === 'module') {
    writeStdout('skipped package.json (already "type": "module")\n')
    return
  }
  if (pkg.type !== undefined) {
    writeStdout(
      `warning: package.json says "type": ${JSON.stringify(pkg.type)}, left as is — the scaffolded .steps.ts is an ES module and will not load until it is "module"\n`,
    )
    return
  }
  writeFileSync(target, `${JSON.stringify({ ...pkg, type: 'module' }, null, 2)}\n`)
  writeStdout('updated package.json (added "type": "module")\n')
}

export async function runInit(opts: InitOptions): Promise<InitResult> {
  const files: Array<{ readonly relPath: string; readonly content: string }> = [
    { relPath: 'varar.config.json', content: CONFIG },
    { relPath: 'varar-examples/deep-thought.md', content: EXAMPLE_MD },
    { relPath: 'varar-examples/steps/deep-thought.steps.ts', content: EXAMPLE_STEPS },
  ]
  for (const f of files) {
    const target = join(opts.cwd, f.relPath)
    if (existsSync(target)) {
      opts.writeStdout(`skipped ${f.relPath} (already exists)\n`)
      continue
    }
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, f.content)
    opts.writeStdout(`created ${f.relPath}\n`)
  }
  ensureEsm(opts.cwd, opts.writeStdout)
  return { exitCode: 0 }
}
