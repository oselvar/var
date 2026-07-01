export interface SnippetEmitter {
  typeNameFor(parameterType: { readonly type: unknown }): string
}

export function createTypeScriptSnippetEmitter(): SnippetEmitter {
  return {
    typeNameFor(parameterType) {
      return parameterType.type === Number ? 'number' : 'string'
    },
  }
}
