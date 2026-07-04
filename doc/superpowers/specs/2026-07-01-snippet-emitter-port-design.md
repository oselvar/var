# `SnippetEmitter` port + relocate snippet generation out of `var-core`

Date: 2026-07-01
Status: design, pending implementation (TDD)

Follow-up to the [tree-sitter `StepDefScanner` sub-project](2026-07-01-treesitter-lsp-scanner-design.md),
picking up the next item from [`doc/ARCHITECTURE.md`](../../../doc/ARCHITECTURE.md) §7:
extracting a `SnippetEmitter` port from the TS-emitting snippet code (step 4).

## Scope

Narrower than ARCHITECTURE.md's framing suggested. Investigated every place
`HandlerParam.typeText` and the snippet-generation code are produced/consumed
before designing anything:

- `typeText` is **already fully opaque** everywhere it's consumed
  (`var-lsp/src/handlers.ts:561-562`'s `renderHandlerParam` just concatenates
  it: `` `${p.name}: ${p.typeText}` ``, never parses it). ARCHITECTURE.md §7
  step 3 ("make `StepDef` neutral") needs no code change — just a doc-comment
  tightening on `HandlerParam.typeText` in `step-defs.ts` making the
  never-parse invariant explicit, since it's already true in practice.
- Of everything the current snippet-generation code does — friendly variable
  naming, collision numbering, `name: type` declaration syntax, the overall
  wrapping template — only **one piece is genuinely TypeScript-specific**:
  mapping a cucumber-expression parameter type to a *type name string*
  (`Number` → `'number'`, else → `'string'`). Variable naming is already
  language-neutral; `name: type` declaration syntax happens to match Python's
  type-hint syntax too; the wrapping is already externalized via
  `var.config.ts`'s `snippet.template` + `{{args}}` interpolation.
- That one mapping is hardcoded **twice**, independently, in
  `var-core/src/snippet.ts:47` (fresh-snippet generation) and
  `var-lsp/src/handlers.ts:576-578` (`tsTypeFor`, used by the rename-refactor
  path) — a real, pre-existing DRY violation this work also fixes.

De-hardcoding the scattered `.steps.ts` literals in `var-vscode`/`website` is
explicitly out of scope — a separate, smaller follow-up.

## Relocation: snippet generation doesn't belong in `var-core`

`var-core` is ported module-for-module to Python (`python/packages/var-core`,
per the [Python core port design](2026-06-30-python-core-port-design.md)).
Snippet generation is purely an authoring/LSP concern — it only ever runs
inside the shared TypeScript LSP process, emitting source text for whichever
language's step file is open, the same reasoning that already puts
`StepDefScanner`/`GrammarLoader` in `var-language` rather than `var-core` (see
the [tree-sitter design doc](2026-07-01-treesitter-lsp-scanner-design.md)).
Leaving it in `var-core` would mean every future Python-port pass has to
remember "this one module doesn't count" — exactly the kind of inconsistency
that erodes "`var-core` stays consistent between ports."

Confirmed empirically, not just by inference: `python/packages/var-core` and
`python/packages/var-runner` have zero snippet-related code anywhere. And
`renderTemplate` (`var-core/src/template.ts`) has exactly one consumer in the
whole codebase — `snippet.ts` — so it isn't a generic utility misplaced
alongside snippet code; it's snippet-specific and should move with it.

**Move** `snippet.ts`, `snippet-template.ts`, and `template.ts` from
`var-core/src/` to `var-language/src/` (alongside `grammar-loader.ts`,
`tree-sitter-scanner.ts` — `var-language` is already documented as "shared,
stays TypeScript forever, serves all languages"). Add the new
`snippet-emitter.ts` there too.

**Stays in `var-core`:** `VarConfig.snippet: { template }` in
`var-core/src/config.ts`. This is a config-schema field on the one unified
`var.config.ts` type, not ported logic — and `config.ts` itself isn't
module-for-module ported to Python in the first place (Python has its own
separate, hand-written `var_runner/config.py`, not a literal port of
`config.ts`). Moving one field out of `VarConfig` to chase a consistency
concern that doesn't actually apply to config schemas would fragment the
single-config-object experience for no benefit.

**Ripple effects:**
- `var-core/src/index.ts` drops the `Snippet`/`generateSnippet`/
  `DEFAULT_SNIPPET_TEMPLATE`/`renderTemplate` exports.
- `var-language/src/index.ts` gains them (plus the new `SnippetEmitter`/
  `createTypeScriptSnippetEmitter`).
- `var-lsp/src/handlers.ts` imports `generateSnippet` from
  `@oselvar/var-language` instead of `@oselvar/var-core` (already a
  dependency — no new package dependency needed).
- `var-core/package.json`'s dependency on `@cucumber/cucumber-expressions`
  (used by `CucumberExpressionGenerator` in `snippet.ts`) — check at
  implementation time whether anything else in `var-core` still needs it;
  if not, it moves to `var-language/package.json` too.
- Existing tests: `var-core/tests/snippet.test.ts` and
  `var-core/tests/template.test.ts` move to `var-language/tests/` alongside
  the code, unchanged in content (this is a relocation, not a rewrite —
  behavior must stay identical).

## The `SnippetEmitter` port

Lives in `var-language/src/snippet-emitter.ts` (moved there with the rest of
the snippet module):

```ts
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
```

The parameter type is typed as the minimal shape actually used (`{ type:
unknown }`) rather than importing `@cucumber/cucumber-expressions`'
`ParameterType` class directly — matches how the current code already treats
it (`pt.type === Number` on a loosely-typed object in both existing call
sites).

**Wiring:**
- `generateSnippet(rawText, registry, options)` gains an optional
  `options.snippetEmitter?: SnippetEmitter`, defaulting to
  `createTypeScriptSnippetEmitter()`. The inline ternary at (currently)
  `snippet.ts:47` becomes `emitter.typeNameFor(pt)`.
- `var-lsp/src/handlers.ts`'s `buildHandlerSync` gains the same optional
  parameter. The standalone `tsTypeFor` function is deleted; its one call
  site becomes a `paramTypeByName` lookup followed by
  `emitter.typeNameFor(pt)`.
- Neither `Store`/`StoreDeps` nor `var.config.ts` gets a new injection point
  for this yet — same incremental approach as `StepDefScanner`: an optional,
  same-package-default port until an actual second-language LSP consumer
  needs to vary it. Wiring it through the config/store layer now would be
  speculative — there is no second consumer today.

## Fallout: `VarConfig.snippet.template` becomes optional

Found while checking every internal consumer before finalizing the
implementation plan (not caught by the earlier file-level grep, which only
looked for cross-*package* imports): `var-core/src/config.ts` itself imports
`DEFAULT_SNIPPET_TEMPLATE` from `./snippet-template.js`, to seed its own
`DEFAULT_CONFIG.snippet.template`. Once that file moves to `var-language`,
`config.ts` importing it back would make `var-core` depend on `var-language`
— backwards, since `var-language` already depends on `var-core`.

`generateSnippet` (in the moved `snippet.ts`) already has its own fallback —
`options.template ?? DEFAULT_SNIPPET_TEMPLATE` — so `config.ts`'s copy of
that same default was redundant duplication one layer up, not a load-bearing
second source of truth. Fix: `VarConfig.snippet.template` becomes optional
(`{ readonly template?: string }`), `config.ts` drops the import and default
entirely (`DEFAULT_CONFIG.snippet = {}`), and `generateSnippet`'s own fallback
becomes the single place the default template is defined.

Ripples: `Store.snippetTemplate()` in `var-lsp` returns `string | undefined`
instead of `string`; its two callers in `handlers.ts` (the fresh-snippet path
and the rename path) each need the same `exactOptionalPropertyTypes`-driven
conditional-spread pattern already used for `store.ts`'s `grammarLoader` fix
in the tree-sitter plan. `var-cli`'s own read of `cfg.snippet.template` is
moot — that file is deleted in this plan's first task. `website`'s
`var-worker.ts` builds its own literal config object with an explicit
`template: DEFAULT_SNIPPET_TEMPLATE`, so it never relied on this default and
is unaffected either way.

## `typeText` doc tightening

In `var-language/src/step-defs.ts` (already moved there by the tree-sitter
sub-project), strengthen `HandlerParam.typeText`'s doc comment to state the
invariant explicitly: this is raw, unparsed source text from whichever
scanner produced it; every consumer must treat it as opaque and never inspect
its content. No type change — it's already `string`, and already opaque in
every real consumer today.

## Testing

- New `var-language/tests/snippet-emitter.test.ts`: 2 cases for
  `createTypeScriptSnippetEmitter` (`Number`-typed → `'number'`; anything
  else, including a custom parameter type → `'string'`).
- `snippet.test.ts` and `template.test.ts` relocate to `var-language/tests/`
  with identical content — the regression guard proving the move didn't
  change behavior.
- `var-lsp`'s existing rename-path tests (wherever `tsTypeFor`'s behavior is
  currently exercised — check `handlers.test.ts` for rename/refactor cases
  touching parameter types) must continue to pass unchanged after `tsTypeFor`
  is deleted and replaced with the shared emitter call.
- Gates: `pnpm -r build` (both `var-core` and `var-language` `src/` change),
  `pnpm typecheck` (touched `tests/` in both packages), `pnpm knip` (catches
  any import path left pointing at the old `var-core` location).

## Out of scope

- De-hardcoding the `.steps.ts` literals in `var-vscode/src/extension.ts` and
  `website/src/lib/run-grouping.ts`/`editor-mount.ts` (ARCHITECTURE.md §7
  step 5) — separate, smaller follow-up.
- Any actual second `SnippetEmitter` implementation (e.g. for Python) — no
  Python LSP integration exists yet; this only prepares the seam.
- Broadening the port beyond `typeNameFor` (variable naming, declaration
  syntax, template selection) — considered and explicitly rejected during
  design as speculative given today's single consumer.
