import { stripLeadingKeyword } from './keywords.js'
import type { Registry } from './registry.js'

export type Snippet = {
  readonly expression: string
  readonly handlerSignature: string
  readonly fullCode: string
}

type Token = { readonly kind: 'int' } | { readonly kind: 'float' } | { readonly kind: 'string' }

const INT_RE = /\b\d+\b/
const FLOAT_RE = /\b\d+\.\d+\b/
const STRING_RE = /"[^"]*"/

const PARAM_NAMES: Record<Token['kind'], string> = {
  int: 'count',
  float: 'price',
  string: 'user',
}

export function generateSnippet(rawText: string, _registry: Registry): Snippet {
  const text = stripLeadingKeyword(rawText.trim())
  const params: Token[] = []
  let cursor = 0
  let expr = ''

  while (cursor < text.length) {
    const slice = text.slice(cursor)
    const floatMatch = FLOAT_RE.exec(slice)
    const intMatch = INT_RE.exec(slice)
    const stringMatch = STRING_RE.exec(slice)
    const candidates = [
      floatMatch ? { kind: 'float' as const, match: floatMatch } : null,
      intMatch && (!floatMatch || intMatch.index < floatMatch.index)
        ? { kind: 'int' as const, match: intMatch }
        : null,
      stringMatch ? { kind: 'string' as const, match: stringMatch } : null,
    ].filter((c): c is { kind: Token['kind']; match: RegExpExecArray } => c !== null)
    if (candidates.length === 0) {
      expr += slice
      break
    }
    candidates.sort((a, b) => a.match.index - b.match.index)
    const best = candidates[0]
    if (!best) {
      expr += slice
      break
    }
    expr += slice.slice(0, best.match.index)
    expr += `{${best.kind}}`
    params.push({ kind: best.kind })
    cursor += best.match.index + best.match[0].length
  }

  const usedNames = new Map<string, number>()
  const handlerArgs = params.map((p) => {
    const baseName = PARAM_NAMES[p.kind]
    const count = (usedNames.get(baseName) ?? 0) + 1
    usedNames.set(baseName, count)
    const name = count === 1 ? baseName : `${baseName}${count}`
    const type = p.kind === 'string' ? 'string' : 'number'
    return `${name}: ${type}`
  })
  const handlerSignature = `(ctx, ${handlerArgs.join(', ')}) => {`
  const fullCode = `step('${expr}', ${handlerSignature}\n  // ...\n})`

  return { expression: expr, handlerSignature, fullCode }
}
