import { CucumberExpressionGenerator } from '@cucumber/cucumber-expressions'
import type { Registry, StepKind } from '@oselvar/var-core'
import { createTypeScriptSnippetEmitter, type SnippetEmitter } from './snippet-emitter.js'
import { DEFAULT_SNIPPET_TEMPLATE } from './snippet-template.js'
import { renderTemplate } from './template.js'

export type Snippet = {
  readonly expression: string
  readonly handlerSignature: string
  readonly fullCode: string
}

// Friendlier variable names for the built-in parameter types. Custom types
// keep their declared name as the variable name, e.g. `{airport} → airport`.
const FRIENDLY_NAMES: Record<string, string> = {
  int: 'count',
  float: 'price',
  string: 'user',
}

export function generateSnippet(
  rawText: string,
  registry: Registry,
  options: {
    readonly template?: string
    readonly role?: StepKind
    readonly snippetEmitter?: SnippetEmitter
  } = {},
): Snippet {
  const emitter = options.snippetEmitter ?? createTypeScriptSnippetEmitter()
  // The expression is the selection verbatim — no Given/When/Then stripping
  // and no other narration heuristics. The user owns what they selected.
  const originalText = rawText.trim()
  const text = originalText

  // Defer to the cucumber-expressions generator: it knows how to rank
  // candidate parameter types (including custom ones registered on the
  // registry), and it returns the most-preferred expression at index 0.
  const generator = new CucumberExpressionGenerator(() => registry.parameterTypes.parameterTypes)
  const generated = generator.generateExpressions(text)[0]
  const expression = generated?.source ?? text

  const usedNames = new Map<string, number>()
  const handlerArgs = (generated?.parameterTypes ?? []).map((pt) => {
    const baseName = FRIENDLY_NAMES[pt.name ?? ''] ?? pt.name ?? 'arg'
    const count = (usedNames.get(baseName) ?? 0) + 1
    usedNames.set(baseName, count)
    const argName = count === 1 ? baseName : `${baseName}${count}`
    return `${argName}: ${emitter.typeNameFor(pt)}`
  })

  const handlerSignature = `(state, ${handlerArgs.join(', ')}) => {`
  const args = ['state', ...handlerArgs].join(', ')
  const role: StepKind = options.role ?? 'action'
  const others = (['context', 'action', 'sensor'] as const).filter((k) => k !== role)
  const fullCode = renderTemplate(options.template ?? DEFAULT_SNIPPET_TEMPLATE, {
    role,
    altA: others[0] as string,
    altB: others[1] as string,
    expression,
    args,
    originalText,
  })

  return { expression, handlerSignature, fullCode }
}
