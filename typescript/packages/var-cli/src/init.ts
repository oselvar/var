import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const CONFIG = `{
  "docs": { "include": ["var-examples/**/*.md"], "exclude": [] },
  "steps": ["var-examples/**/*.steps.ts"]
}
`

const EXAMPLE_MD = `# Deep Thought

You're really not going to like it.

The answer to the great question of life, the universe and everything is 42.

It was a tough assignment.
`

const EXAMPLE_STEPS = `import { steps } from '@oselvar/var'

const { sensor } = steps()

sensor('life, the universe and everything is {int}', () => 42)
`

export type InitOptions = {
  readonly cwd: string
  readonly writeStdout: (s: string) => void
}

export type InitResult = { readonly exitCode: number }

export async function runInit(opts: InitOptions): Promise<InitResult> {
  const files: Array<{ readonly relPath: string; readonly content: string }> = [
    { relPath: 'var.config.json', content: CONFIG },
    { relPath: 'var-examples/deep-thought.md', content: EXAMPLE_MD },
    { relPath: 'var-examples/steps/deep-thought.steps.ts', content: EXAMPLE_STEPS },
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
  return { exitCode: 0 }
}
