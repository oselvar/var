import { describe, expect, it } from 'vitest'
import { decodeEntities, highlightSteps } from './step-highlight.js'

const STEP_SOURCE = `import { defineContext } from '@oselvar/var-vitest'
const { step } = defineContext(() => ({ greeting: '' }))
step('I greet {string}', (ctx, name: string) => {})
step('the greeting should be {string}', (ctx, expected: string) => {})
`

const steps = [{ path: '01-hello.steps.ts', source: STEP_SOURCE }]

function lineText(line: ReadonlyArray<{ text: string }>): string {
  return line.map((s) => s.text).join('')
}

describe('highlightSteps', () => {
  it('preserves every line verbatim across segments', () => {
    const source = '# Hi\n\nFirst I greet "world" okay? I think the greeting should be "Hello, world!"\n'
    const lines = highlightSteps({ varPath: 'hello.var.md', source, steps })
    const original = source.split('\n')
    expect(lines.length).toBe(original.length)
    lines.forEach((line, i) => expect(lineText(line)).toBe(original[i]))
  })

  it('marks captured parameters as param segments', () => {
    const source = 'First I greet "world" okay? I think the greeting should be "Hello, world!"'
    const [line] = highlightSteps({ varPath: 'hello.var.md', source, steps })
    const params = line.filter((s) => s.kind === 'param').map((s) => s.text)
    expect(params).toContain('world')
    expect(params).toContain('Hello, world!')
    expect(line.some((s) => s.kind === 'step')).toBe(true)
  })

  it('leaves non-matching lines fully plain', () => {
    const source = '# Hi'
    const [line] = highlightSteps({ varPath: 'hello.var.md', source, steps })
    expect(line).toEqual([{ text: '# Hi', kind: 'plain' }])
  })

  it('returns all-plain lines when no steps are supplied', () => {
    const source = 'First I greet "world"'
    const [line] = highlightSteps({ varPath: 'hello.var.md', source, steps: [] })
    expect(line).toEqual([{ text: 'First I greet "world"', kind: 'plain' }])
  })
})

describe('decodeEntities', () => {
  it('reverses the entities Astro emits', () => {
    expect(decodeEntities('a &amp; b &lt;c&gt; &quot;q&quot; &#39;x&#39; &#34;y&#34;')).toBe(
      'a & b <c> "q" \'x\' "y"',
    )
  })
})
