import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadVarConfig } from '@oselvar/var-config'
import { expect, test } from 'vitest'
import { buildHandlers } from '../src/handlers.js'
import { createNodeFileSystem } from '../src/node-file-system.js'
import { createNodeGrammarLoader } from '../src/node-grammar-loader.js'
import { createStore } from '../src/store.js'

function tempWorkspace(setup: (dir: string) => void): { dir: string; cleanup: () => void } {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'var-lsp-')))
  setup(dir)
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

async function makeStore(dir: string) {
  const config = await loadVarConfig(dir)
  const fs = createNodeFileSystem(dir)
  const store = createStore({ fs, config, grammarLoader: createNodeGrammarLoader() })
  await store.reindex()
  return store
}

test('hoverOnMd returns the matching step def expression and source location', async () => {
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(join(dir, 'var.config.ts'), "export default { vars: ['**/*.md'] }\n")
    writeFileSync(
      join(dir, 'a.steps.ts'),
      `action('I have {int} cukes', () => {})
`,
    )
    writeFileSync(join(dir, 'b.md'), '# B\n\nGiven I have 5 cukes')
  })
  try {
    const store = await makeStore(dir)
    const h = buildHandlers(store)
    // Cursor on line 3, character 12 (somewhere inside "I have 5 cukes")
    const result = h.hover({
      uri: `file://${join(dir, 'b.md')}`,
      // 0-based: source line 3 (Given) → LSP line 2
      position: { line: 2, character: 11 },
    })
    expect(result?.contents).toMatch(/I have \{int\} cukes/)
    expect(result?.contents).toContain('a.steps.ts')
  } finally {
    cleanup()
  }
})

test('definitionFromMd returns the steps.ts location for a matched step', async () => {
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(join(dir, 'var.config.ts'), "export default { vars: ['**/*.md'] }\n")
    writeFileSync(
      join(dir, 'a.steps.ts'),
      `action('I have {int} cukes', () => {})
`,
    )
    writeFileSync(join(dir, 'b.md'), '# B\n\nGiven I have 5 cukes')
  })
  try {
    const store = await makeStore(dir)
    const h = buildHandlers(store)
    const result = h.definition({
      uri: `file://${join(dir, 'b.md')}`,
      // 0-based: source line 3 (Given) → LSP line 2
      position: { line: 2, character: 11 },
    })
    expect(result).toHaveLength(1)
    const link = result[0]!
    expect(link.targetUri).toBe(`file://${join(dir, 'a.steps.ts')}`)
    expect(link.targetRange.start.line).toBe(0)
    // originSelectionRange covers the full matched substring (not just one word).
    expect(link.originSelectionRange.start.line).toBe(2)
    expect(link.originSelectionRange.end.line).toBe(2)
    expect(
      link.originSelectionRange.end.character - link.originSelectionRange.start.character,
    ).toBeGreaterThan(5)
  } finally {
    cleanup()
  }
})

test('hover on the second of two adjacent steps returns the second step (off-by-one regression)', async () => {
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(join(dir, 'var.config.ts'), "export default { vars: ['**/*.md'] }\n")
    writeFileSync(
      join(dir, 'a.steps.ts'),
      `action('I greet {string}', () => {})
sensor('the greeting is {string}', () => {})
`,
    )
    writeFileSync(
      join(dir, 'b.md'),
      '# B\n\nGiven I greet "world"\nThen the greeting is "Hello, world!"\n',
    )
  })
  try {
    const store = await makeStore(dir)
    const h = buildHandlers(store)
    // 0-based: source line 4 is `Then the greeting is "Hello, world!"`, char 18 = "is"
    const result = h.hover({
      uri: `file://${join(dir, 'b.md')}`,
      position: { line: 3, character: 18 },
    })
    expect(result?.contents).toMatch(/the greeting is \{string\}/)
    expect(result?.contents).not.toMatch(/I greet \{string\}/)
  } finally {
    cleanup()
  }
})

test('stepAt resolves the step from a .md match and returns every matched site with values', async () => {
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(join(dir, 'var.config.ts'), "export default { vars: ['**/*.md'] }\n")
    writeFileSync(
      join(dir, 'a.steps.ts'),
      `action('I greet {string}', () => {})
`,
    )
    writeFileSync(join(dir, 'a.md'), '# A\n\nGiven I greet "world"\n')
    writeFileSync(join(dir, 'b.md'), '# B\n\nWhen I greet "Aslak"\n')
  })
  try {
    const store = await makeStore(dir)
    const h = buildHandlers(store)
    // Cursor on line 3 (0-based 2), character 11 — inside the matched range
    // of the .md "Given I greet \"world\"" sentence.
    const result = h.stepAt({
      uri: `file://${join(dir, 'a.md')}`,
      position: { line: 2, character: 11 },
    })
    expect(result).not.toBeNull()
    expect(result?.expression).toBe('I greet {string}')
    expect(result?.stepDefUri).toBe(`file://${join(dir, 'a.steps.ts')}`)
    expect(result?.matches).toHaveLength(2)
    const values = result?.matches.map((m) => m.paramValues[0]).sort()
    expect(values).toEqual(['"Aslak"', '"world"'])
  } finally {
    cleanup()
  }
})

test('stepAt resolves the step from a .ts cucumber-expression literal position', async () => {
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(join(dir, 'var.config.ts'), "export default { vars: ['**/*.md'] }\n")
    writeFileSync(
      join(dir, 'a.steps.ts'),
      `action('I greet {string}', () => {})
`,
    )
    writeFileSync(join(dir, 'a.md'), '# A\n\nGiven I greet "world"\n')
  })
  try {
    const store = await makeStore(dir)
    const h = buildHandlers(store)
    // 0-based: line 0, character 8 — inside the 'I greet {string}' literal.
    const result = h.stepAt({
      uri: `file://${join(dir, 'a.steps.ts')}`,
      position: { line: 0, character: 8 },
    })
    expect(result).not.toBeNull()
    expect(result?.expression).toBe('I greet {string}')
    expect(result?.matches).toHaveLength(1)
    expect(result?.matches[0]?.paramValues).toEqual(['"world"'])
  } finally {
    cleanup()
  }
})

test('stepAt returns null when the cursor is on plain prose, outside any step', async () => {
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(join(dir, 'var.config.ts'), "export default { vars: ['**/*.md'] }\n")
    writeFileSync(join(dir, 'a.md'), '# A\n\nThis is just prose, no step here.\n')
  })
  try {
    const store = await makeStore(dir)
    const h = buildHandlers(store)
    const result = h.stepAt({
      uri: `file://${join(dir, 'a.md')}`,
      position: { line: 2, character: 5 },
    })
    expect(result).toBeNull()
  } finally {
    cleanup()
  }
})

test('renameStep (literal-only) produces a cascade across the step def + every match site', async () => {
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(join(dir, 'var.config.ts'), "export default { vars: ['**/*.md'] }\n")
    writeFileSync(
      join(dir, 'a.steps.ts'),
      `action('I greet {string}', () => {})
`,
    )
    writeFileSync(join(dir, 'a.md'), '# A\n\nGiven I greet "world"\n')
    writeFileSync(join(dir, 'b.md'), '# B\n\nWhen I greet "Aslak"\n')
  })
  try {
    const store = await makeStore(dir)
    const h = buildHandlers(store)
    // Cursor on line 0 character 8 of a.steps.ts → inside 'I greet {string}'.
    // The user types the new expression directly.
    const result = h.renameStep({
      uri: `file://${join(dir, 'a.steps.ts')}`,
      position: { line: 0, character: 8 },
      newName: 'I welcome {string}',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.stepDef.newExpression).toBe('I welcome {string}')
    expect(result.sites).toHaveLength(2)
    // The captured values ("world" and "Aslak") survive intact.
    const newTexts = result.sites.map((s) => s.newText).sort()
    expect(newTexts).toEqual(['I welcome "Aslak"', 'I welcome "world"'])
  } finally {
    cleanup()
  }
})

test('planRename returns added/removed fates so the client can prompt', async () => {
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(join(dir, 'var.config.ts'), "export default { vars: ['**/*.md'] }\n")
    writeFileSync(
      join(dir, 'a.steps.ts'),
      `action('I greet {string}', () => {})
`,
    )
    writeFileSync(join(dir, 'a.md'), '# A\n\nGiven I greet "world"\n')
    writeFileSync(join(dir, 'b.md'), '# B\n\nWhen I greet "Aslak"\n')
  })
  try {
    const store = await makeStore(dir)
    const h = buildHandlers(store)
    const plan = h.planRename({
      uri: `file://${join(dir, 'a.steps.ts')}`,
      position: { line: 0, character: 8 },
      newName: 'I greet {string} {int} times',
    })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.newExpression).toBe('I greet {string} {int} times')
    expect(plan.matches).toHaveLength(2)
    expect(plan.paramFates).toEqual([
      {
        kind: 'kept',
        oldIndex: 0,
        newIndex: 0,
        oldName: 'string',
        newName: 'string',
        nameUnchanged: true,
      },
      { kind: 'added', newIndex: 1, name: 'int' },
    ])
  } finally {
    cleanup()
  }
})

test('planRename surfaces a type change as kept + nameUnchanged:false (the client prompts for the new value)', async () => {
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(join(dir, 'var.config.ts'), "export default { vars: ['**/*.md'] }\n")
    writeFileSync(
      join(dir, 'a.steps.ts'),
      `const { action } = defineState(() => ({}), { airport: { regexp: /[A-Z]{3}/ } })
action('I fly to {string}', () => {})
`,
    )
    writeFileSync(join(dir, 'a.md'), '# A\n\nGiven I fly to "world"\n')
  })
  try {
    const store = await makeStore(dir)
    const h = buildHandlers(store)
    const plan = h.planRename({
      uri: `file://${join(dir, 'a.steps.ts')}`,
      position: { line: 1, character: 8 },
      newName: 'I fly to {airport}',
    })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.paramFates).toEqual([
      {
        kind: 'kept',
        oldIndex: 0,
        newIndex: 0,
        oldName: 'string',
        newName: 'airport',
        nameUnchanged: false,
      },
    ])
  } finally {
    cleanup()
  }
})

test('planRename emits a handlerSync that adds a new typed arg when a parameter is added', async () => {
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(join(dir, 'var.config.ts'), "export default { vars: ['**/*.md'] }\n")
    writeFileSync(
      join(dir, 'a.steps.ts'),
      `action('I greet {string}', (ctx, name: string) => {})
`,
    )
    writeFileSync(join(dir, 'a.md'), '# A\n\nGiven I greet "world"\n')
  })
  try {
    const store = await makeStore(dir)
    const h = buildHandlers(store)
    const plan = h.planRename({
      uri: `file://${join(dir, 'a.steps.ts')}`,
      position: { line: 0, character: 8 },
      newName: 'I greet {string} {int} times',
    })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.handlerSync).toBeDefined()
    // The added {int} gets its friendly name (`count`) + the right TS type.
    expect(plan.handlerSync?.newText).toBe('ctx, name: string, count: number')
  } finally {
    cleanup()
  }
})

test('planRename emits a handlerSync that drops a removed arg', async () => {
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(join(dir, 'var.config.ts'), "export default { vars: ['**/*.md'] }\n")
    writeFileSync(
      join(dir, 'a.steps.ts'),
      `action('I greet {string} loudly', (ctx, name: string) => {})
`,
    )
    writeFileSync(join(dir, 'a.md'), '# A\n\nGiven I greet "world" loudly\n')
  })
  try {
    const store = await makeStore(dir)
    const h = buildHandlers(store)
    const plan = h.planRename({
      uri: `file://${join(dir, 'a.steps.ts')}`,
      position: { line: 0, character: 8 },
      newName: 'I greet loudly',
    })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.handlerSync?.newText).toBe('ctx')
  } finally {
    cleanup()
  }
})

test('planRename emits a handlerSync that swaps the TS type when a param type changes', async () => {
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(join(dir, 'var.config.ts'), "export default { vars: ['**/*.md'] }\n")
    writeFileSync(
      join(dir, 'a.steps.ts'),
      `const { action } = defineState(() => ({}), { airport: { regexp: /[A-Z]{3}/ } })
action('I fly to {string}', (ctx, name: string) => {})
`,
    )
    writeFileSync(join(dir, 'a.md'), '# A\n\nGiven I fly to "world"\n')
  })
  try {
    const store = await makeStore(dir)
    const h = buildHandlers(store)
    const plan = h.planRename({
      uri: `file://${join(dir, 'a.steps.ts')}`,
      position: { line: 1, character: 8 },
      newName: 'I fly to {airport}',
    })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    // The {airport} type has type:null → defaults to 'string'. Name becomes
    // 'airport' since there is no FRIENDLY_NAMES override.
    expect(plan.handlerSync?.newText).toBe('ctx, airport: string')
  } finally {
    cleanup()
  }
})

test('renderExpressionText rebuilds a sentence from an expression + captured values', async () => {
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(join(dir, 'var.config.ts'), "export default { vars: ['**/*.md'] }\n")
    writeFileSync(
      join(dir, 'a.steps.ts'),
      `const { action } = defineState(() => ({}), { airport: { regexp: /[A-Z]{3}/ } })
`,
    )
  })
  try {
    const store = await makeStore(dir)
    const h = buildHandlers(store)
    const rendered = h.renderExpressionText({
      expression: 'I drive from {airport} to {airport}',
      values: ['LHR', 'JFK'],
    })
    expect(rendered.ok).toBe(true)
    if (!rendered.ok) return
    expect(rendered.text).toBe('I drive from LHR to JFK')
  } finally {
    cleanup()
  }
})

test('renameStep refuses when a parameter is added (Phase 4 territory)', async () => {
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(join(dir, 'var.config.ts'), "export default { vars: ['**/*.md'] }\n")
    writeFileSync(
      join(dir, 'a.steps.ts'),
      `action('I greet {string}', () => {})
`,
    )
    writeFileSync(join(dir, 'a.md'), '# A\n\nGiven I greet "world"\n')
  })
  try {
    const store = await makeStore(dir)
    const h = buildHandlers(store)
    const result = h.renameStep({
      uri: `file://${join(dir, 'a.steps.ts')}`,
      position: { line: 0, character: 8 },
      newName: 'I greet {string} {int} times',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/adding a parameter/)
  } finally {
    cleanup()
  }
})

test('renameStep from a .md uses CucumberExpressionGenerator on the new sentence', async () => {
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(join(dir, 'var.config.ts'), "export default { vars: ['**/*.md'] }\n")
    writeFileSync(
      join(dir, 'a.steps.ts'),
      `action('I greet {string}', () => {})
`,
    )
    writeFileSync(join(dir, 'a.md'), '# A\n\nGiven I greet "world"\n')
  })
  try {
    const store = await makeStore(dir)
    const h = buildHandlers(store)
    // The user F2'd in a.md and typed a new sentence.
    const result = h.renameStep({
      uri: `file://${join(dir, 'a.md')}`,
      position: { line: 2, character: 11 },
      newName: 'I welcome "world"',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.stepDef.newExpression).toBe('I welcome {string}')
    expect(result.sites[0]?.newText).toBe('I welcome "world"')
  } finally {
    cleanup()
  }
})

test('completions: returns a snippet item per registered step, replacing from line start when no keyword is present', async () => {
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(join(dir, 'var.config.ts'), "export default { vars: ['**/*.md'] }\n")
    writeFileSync(
      join(dir, 'a.steps.ts'),
      `action('I have {int} cukes', () => {})
action('I greet {string}', () => {})
`,
    )
  })
  try {
    const store = await makeStore(dir)
    const h = buildHandlers(store)
    const items = h.completions({
      uri: `file://${join(dir, 'b.md')}`,
      position: { line: 2, character: 5 },
      linePrefix: 'I gr',
    })
    expect(items).toHaveLength(2)
    const greet = items.find((i) => i.label === 'I greet {string}')!
    // biome-ignore lint/suspicious/noTemplateCurlyInString: VSCode snippet tab-stop syntax, not a template literal
    expect(greet.insertText).toBe('I greet ${1:"value"}')
    expect(greet.filterText).toBe('I greet')
    // No leading keyword → replace from the start of the line.
    expect(greet.range.start.character).toBe(0)
    expect(greet.range.end.character).toBe(5)
  } finally {
    cleanup()
  }
})

test('completions: replace range starts at the first non-whitespace of the line (no keyword sniffing)', async () => {
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(join(dir, 'var.config.ts'), "export default { vars: ['**/*.md'] }\n")
    writeFileSync(
      join(dir, 'a.steps.ts'),
      `action('I greet {string}', () => {})
`,
    )
  })
  try {
    const store = await makeStore(dir)
    const h = buildHandlers(store)
    // The line is indented by two spaces (e.g. inside a list item). The
    // replace range should start AT the first non-whitespace character; any
    // leading "Given" / "When" etc. gets replaced too — the user owns the
    // narration around the snippet.
    const items = h.completions({
      uri: `file://${join(dir, 'b.md')}`,
      position: { line: 2, character: 12 },
      linePrefix: '  Given I gr',
    })
    expect(items).toHaveLength(1)
    expect(items[0]?.range.start.character).toBe(2)
    expect(items[0]?.range.end.character).toBe(12)
  } finally {
    cleanup()
  }
})

test('completions: a custom {airport} type uses its name as the placeholder', async () => {
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(join(dir, 'var.config.ts'), "export default { vars: ['**/*.md'] }\n")
    writeFileSync(
      join(dir, 'a.steps.ts'),
      `const { action } = defineState(() => ({}), { airport: { regexp: /[A-Z]{3}/ } })
action('I fly to {airport}', () => {})
`,
    )
  })
  try {
    const store = await makeStore(dir)
    const h = buildHandlers(store)
    const items = h.completions({
      uri: `file://${join(dir, 'b.md')}`,
      position: { line: 0, character: 0 },
      linePrefix: '',
    })
    // biome-ignore lint/suspicious/noTemplateCurlyInString: VSCode snippet tab-stop syntax, not a template literal
    expect(items[0]?.insertText).toBe('I fly to ${1:airport}')
  } finally {
    cleanup()
  }
})

test('completions: returns nothing for non-.md files', async () => {
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(join(dir, 'var.config.ts'), "export default { vars: ['**/*.md'] }\n")
    writeFileSync(
      join(dir, 'a.steps.ts'),
      `action('I greet {string}', () => {})
`,
    )
  })
  try {
    const store = await makeStore(dir)
    const h = buildHandlers(store)
    const items = h.completions({
      uri: `file://${join(dir, 'a.steps.ts')}`,
      position: { line: 0, character: 0 },
      linePrefix: '',
    })
    expect(items).toEqual([])
  } finally {
    cleanup()
  }
})

test('generateSnippet turns selected text into a step-definition stub (verbatim, no keyword strip)', async () => {
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(join(dir, 'var.config.ts'), "export default { vars: ['**/*.md'] }\n")
  })
  try {
    const store = await makeStore(dir)
    const h = buildHandlers(store)
    // No uri/position provided — defaults to 'action'.
    const snippet = h.generateSnippet({ text: 'Given I greet "world"' })
    // No Given/When/Then heuristics — the selection IS the expression.
    expect(snippet.expression).toBe('Given I greet {string}')
    expect(snippet.fullCode).toMatch(/^action\(/m)
  } finally {
    cleanup()
  }
})

test('generateSnippet infers action role when position is before a sensor and nothing else exists', async () => {
  // before=[], after=['sensor'] → inferStepRole → 'action'
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(join(dir, 'var.config.ts'), "export default { vars: ['**/*.md'] }\n")
    writeFileSync(join(dir, 'a.steps.ts'), `sensor('the greeting is {string}', () => {})\n`)
    writeFileSync(join(dir, 'b.md'), '# B\n\nThen the greeting is "Hello, world!"\n')
  })
  try {
    const store = await makeStore(dir)
    const h = buildHandlers(store)
    // 0-based position on line 1 (empty line), before the sensor step on line 2.
    const snippet = h.generateSnippet({
      text: 'I greet "world"',
      uri: `file://${join(dir, 'b.md')}`,
      position: { line: 1, character: 0 },
    })
    expect(snippet.fullCode).toMatch(/^action\(/m)
  } finally {
    cleanup()
  }
})

test('generateSnippet infers sensor role when position is after all matched steps', async () => {
  // before=['action'], after=[] → inferStepRole → 'sensor'
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(join(dir, 'var.config.ts'), "export default { vars: ['**/*.md'] }\n")
    writeFileSync(join(dir, 'a.steps.ts'), `action('I greet {string}', () => {})\n`)
    writeFileSync(join(dir, 'b.md'), '# B\n\nGiven I greet "world"\n')
  })
  try {
    const store = await makeStore(dir)
    const h = buildHandlers(store)
    // 0-based position on line 3 (past the last matched step on line 2).
    const snippet = h.generateSnippet({
      text: 'the greeting is "Hello, world!"',
      uri: `file://${join(dir, 'b.md')}`,
      position: { line: 3, character: 0 },
    })
    expect(snippet.fullCode).toMatch(/^sensor\(/m)
  } finally {
    cleanup()
  }
})

test('diagnosticsFor does NOT emit anything for a keyword-led but unmatched sentence', async () => {
  // No Given/When/Then heuristic — step-def generation is selection-driven.
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(join(dir, 'var.config.ts'), "export default { vars: ['**/*.md'] }\n")
    writeFileSync(join(dir, 'b.md'), '# B\n\nGiven I have 5 cukes')
  })
  try {
    const store = await makeStore(dir)
    const h = buildHandlers(store)
    const diags = h.diagnosticsFor(`file://${join(dir, 'b.md')}`)
    expect(diags).toEqual([])
  } finally {
    cleanup()
  }
})
