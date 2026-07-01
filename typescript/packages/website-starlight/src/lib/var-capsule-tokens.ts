import type { DecodedToken } from './cm-semantic-tokens.js'

// Pure: join a matched-step (`function`) token to an immediately-following
// `parameter` token on the same line by extending the function token's length
// to reach the parameter's start. This absorbs the inter-token whitespace so
// the two decorations render as one adjacent capsule. In the var grammar only
// whitespace ever sits between a step literal and its capture, so extending to
// the parameter start is always correct.
export function joinStepParamTokens(tokens: ReadonlyArray<DecodedToken>): DecodedToken[] {
  return tokens.map((tok, i) => {
    if (tok.type !== 'function') return { ...tok }
    const next = tokens[i + 1]
    if (
      next &&
      next.type === 'parameter' &&
      next.line === tok.line &&
      next.char >= tok.char + tok.length
    ) {
      return { ...tok, length: next.char - tok.char }
    }
    return { ...tok }
  })
}
