// The LSP wire contract shared by the server (handlers.ts) and the VSCode
// client (var-vscode/extension.ts). These types describe the JSON exchanged
// over custom `var/*` requests, so they must stay structurally identical on
// both ends — keeping them here is the single source of truth that prevents
// the two sides from drifting. Ranges/positions are 0-based LSP coordinates.

export type Position = { readonly line: number; readonly character: number }
export type Range = { readonly start: Position; readonly end: Position }

// Output of `var/stepAt`: everything the Rename refactor needs to compute a
// cross-file WorkspaceEdit from a single F2 position.
export type StepAtMatch = {
  readonly uri: string
  readonly range: Range
  readonly paramRanges: ReadonlyArray<Range>
  readonly paramValues: ReadonlyArray<string>
}

export type StepAtResult = {
  readonly expression: string
  readonly stepDefUri: string
  readonly expressionRange: Range
  readonly matches: ReadonlyArray<StepAtMatch>
} | null

// Per-parameter outcome of a rename, with the OLD and NEW parameter names so
// the client can drive per-site prompts for added / type-changed parameters.
export type PlanParamFate =
  | {
      readonly kind: 'kept'
      readonly oldIndex: number
      readonly newIndex: number
      readonly oldName: string
      readonly newName: string
      readonly nameUnchanged: boolean
    }
  | { readonly kind: 'added'; readonly newIndex: number; readonly name: string }
  | { readonly kind: 'removed'; readonly oldIndex: number; readonly name: string }

// A ready-to-apply edit to the TS handler signature that accompanies a rename.
export type HandlerSync = {
  readonly uri: string
  readonly range: Range
  readonly newText: string
}

// Plan-only output of `var/planRename`: the analysis the client needs before
// any edit is applied.
export type PlanRenameResult =
  | {
      readonly ok: true
      readonly newExpression: string
      readonly paramFates: ReadonlyArray<PlanParamFate>
      readonly stepDef: { readonly uri: string; readonly expressionInnerRange: Range }
      readonly matches: ReadonlyArray<{
        readonly uri: string
        readonly range: Range
        readonly paramValues: ReadonlyArray<string>
      }>
      readonly handlerSync?: HandlerSync | undefined
    }
  | { readonly ok: false; readonly error: string }

// Output of `var/stepGlobs`: the step-file globs from config.steps, each
// classified by the server (by glob extension, tsx folded into typescript).
// The server owns all path→language knowledge; clients only compare the
// `language` field against `GenerateSnippetResult.language`.
export type StepGlob = {
  readonly glob: string
  // Absent when the glob's extension is not a recognized step language.
  readonly language?: string
}

// Output of `var/generateSnippet`.
export type GenerateSnippetResult = {
  readonly fullCode: string
  readonly expression: string
  // The language the server selected from config.steps (the user-approved
  // algorithm: single configured language, else most step files, tie broken
  // by config order). The client filters its steps-file quick-pick to this.
  readonly language: string
}

export type RenderTextResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly error: string }
