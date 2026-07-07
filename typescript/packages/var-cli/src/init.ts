import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const CONFIG = `{
  "docs": { "include": ["var-examples/**/*.md"], "exclude": [] },
  "steps": ["var-examples/**/*.steps.ts"]
}
`

const EXAMPLE_MD = `# Hello, BDD

Given I greet "world"
Then the greeting is "Hello, world!"
`

const EXAMPLE_STEPS = `import { steps } from '@oselvar/var'

const { stimulus, sensor } = steps(() => ({ greeting: '' }))

stimulus('I greet {string}', (_state, name: string) => ({ greeting: \`Hello, \${name}!\` }))

sensor('the greeting is {string}', (state, _expected: string) => state.greeting)
`

export type InitOptions = {
  readonly cwd: string
  readonly writeStdout: (s: string) => void
}

export type InitResult = { readonly exitCode: number }

export async function runInit(opts: InitOptions): Promise<InitResult> {
  const files: Array<{ readonly relPath: string; readonly content: string }> = [
    { relPath: 'var.config.json', content: CONFIG },
    { relPath: 'var-examples/01-hello.md', content: EXAMPLE_MD },
    { relPath: 'var-examples/steps/01-hello.steps.ts', content: EXAMPLE_STEPS },
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
