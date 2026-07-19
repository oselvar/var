export type { GrammarLoader } from './grammar-loader.ts'
export type { DiagnosticRef, MatchRef, WorkspaceIndex, WorkspaceInput } from './index-workspace.ts'
export { buildWorkspaceIndex } from './index-workspace.ts'
export type { StepDefScanner } from './scanner.ts'
export type { Snippet } from './snippet.ts'
export { generateSnippet } from './snippet.ts'
export type { SnippetEmitter } from './snippet-emitter.ts'
export {
  createJavaSnippetEmitter,
  createKotlinSnippetEmitter,
  createPythonSnippetEmitter,
  createTypeScriptSnippetEmitter,
  emitterForLanguage,
} from './snippet-emitter.ts'
export {
  DEFAULT_SNIPPET_TEMPLATE,
  JAVA_SNIPPET_TEMPLATE,
  KOTLIN_SNIPPET_TEMPLATE,
  PYTHON_SNIPPET_TEMPLATE,
} from './snippet-template.ts'
export type { ParameterTypeDef, Position, Range, StepDef } from './step-defs.ts'
export { renderTemplate } from './template.ts'
export { createTreeSitterScanner, languageIdForPath } from './tree-sitter-scanner.ts'
export const VERSION = '0.0.0'
