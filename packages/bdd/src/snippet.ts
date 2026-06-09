import { stripLeadingKeyword } from './keywords.js'
import type { Registry } from './registry.js'
import { DEFAULT_SNIPPET_TEMPLATE } from './snippet-template.js'
import { renderTemplate } from './template.js'

export type Snippet = {
  readonly expression: string
  readonly handlerSignature: string
  readonly fullCode: string
}

type Token =
  | { readonly kind: 'int'; readonly name: 'int'; readonly tsType: 'number' }
  | { readonly kind: 'float'; readonly name: 'float'; readonly tsType: 'number' }
  | { readonly kind: 'string'; readonly name: 'string'; readonly tsType: 'string' }
  | { readonly kind: 'custom'; readonly name: string; readonly tsType: 'string' }

type Candidate = {
  readonly kind: 'int' | 'float' | 'string' | 'custom'
  readonly name: string
  readonly tsType: 'number' | 'string'
  readonly index: number
  readonly length: number
}

const INT_RE = /\b\d+\b/
const FLOAT_RE = /\b\d+\.\d+\b/
const STRING_RE = /"[^"]*"/

const PARAM_NAMES: Record<'int' | 'float' | 'string', string> = {
  int: 'count',
  float: 'price',
  string: 'user',
}

function customMatches(
  text: string,
  registry: Registry,
): { name: string; index: number; length: number } | undefined {
  let best: { name: string; index: number; length: number } | undefined
  for (const p of registry.parameterTypes.parameterTypes) {
    // Skip built-in parameter types — we handle int/float/string natively.
    if (p.builtin) continue
    if (!p.name) continue
    for (const regexpString of p.regexpStrings) {
      const re = new RegExp(regexpString)
      const m = re.exec(text)
      if (!m) continue
      const candidate = { name: p.name, index: m.index, length: m[0].length }
      if (!best || candidate.index < best.index) best = candidate
    }
  }
  return best
}

export function generateSnippet(
  rawText: string,
  registry: Registry,
  options: { readonly template?: string } = {},
): Snippet {
  const originalText = rawText.trim()
  const text = stripLeadingKeyword(originalText)
  const params: Token[] = []
  let cursor = 0
  let expr = ''

  while (cursor < text.length) {
    const slice = text.slice(cursor)
    const floatMatch = FLOAT_RE.exec(slice)
    const intMatch = INT_RE.exec(slice)
    const stringMatch = STRING_RE.exec(slice)
    const customMatch = customMatches(slice, registry)

    const candidates: Candidate[] = []
    if (floatMatch) {
      candidates.push({
        kind: 'float',
        name: 'float',
        tsType: 'number',
        index: floatMatch.index,
        length: floatMatch[0].length,
      })
    }
    if (intMatch && (!floatMatch || intMatch.index < floatMatch.index)) {
      candidates.push({
        kind: 'int',
        name: 'int',
        tsType: 'number',
        index: intMatch.index,
        length: intMatch[0].length,
      })
    }
    if (stringMatch) {
      candidates.push({
        kind: 'string',
        name: 'string',
        tsType: 'string',
        index: stringMatch.index,
        length: stringMatch[0].length,
      })
    }
    if (customMatch) {
      candidates.push({
        kind: 'custom',
        name: customMatch.name,
        tsType: 'string',
        index: customMatch.index,
        length: customMatch.length,
      })
    }

    if (candidates.length === 0) {
      expr += slice
      break
    }
    candidates.sort((a, b) => a.index - b.index)
    const best = candidates[0]
    if (!best) {
      expr += slice
      break
    }
    expr += slice.slice(0, best.index)
    expr += `{${best.name}}`
    params.push({ kind: best.kind, name: best.name, tsType: best.tsType } as Token)
    cursor += best.index + best.length
  }

  const usedNames = new Map<string, number>()
  const handlerArgs = params.map((p) => {
    let baseName: string
    if (p.kind === 'custom') {
      baseName = p.name
    } else {
      baseName = PARAM_NAMES[p.kind]
    }
    const count = (usedNames.get(baseName) ?? 0) + 1
    usedNames.set(baseName, count)
    const argName = count === 1 ? baseName : `${baseName}${count}`
    return `${argName}: ${p.tsType}`
  })
  const handlerSignature = `(ctx, ${handlerArgs.join(', ')}) => {`
  const args = ['ctx', ...handlerArgs].join(', ')
  const fullCode = renderTemplate(options.template ?? DEFAULT_SNIPPET_TEMPLATE, {
    expression: expr,
    args,
    originalText,
  })

  return { expression: expr, handlerSignature, fullCode }
}
