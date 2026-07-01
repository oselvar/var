# Tree-sitter `StepDefScanner` — first tree-sitter sub-project

Date: 2026-07-01
Status: design, pending implementation (TDD)

First concrete step of the tree-sitter adoption flagged as a direction (not yet
committed) in [ADR 0001](../../adr/0001-second-language-python.md) and detailed
in [`doc/ARCHITECTURE.md`](../../../doc/ARCHITECTURE.md) §2 and §7. This covers
§7 steps 1 and 2 together:

1. Reimplement the TypeScript-compiler-based `StepDefScanner` on tree-sitter,
   keeping the port signature and making the existing tests pass unchanged.
2. Move extraction to the async shell edge; add the `GrammarLoader` port.

Scoped to TypeScript alone — no Python exists yet. Dogfooded for real: `var-lsp`
switches its default scanner to the tree-sitter implementation. `website` and
`var-vscode` are explicitly **not** touched (see Out of scope).

## Why this scope

`buildWorkspaceIndex` (`packages/var-language/src/index-workspace.ts`) already
accepts an injectable `scanner: StepDefScanner`, defaulting to
`createTypeScriptScanner()`. The port shape is already right — ADR 0001 and
ARCHITECTURE.md both call out that only the *implementation* is
TypeScript-compiler-specific. That makes this the natural first cut: swap the
implementation behind an unchanged port, on the one language we already have,
before any second language forces the issue.

Doing this on TypeScript first is what makes the *second* language (Python)
"grammar + queries + fixtures" instead of a from-scratch design exercise.

## Architecture

### `var-language` (stays environment-agnostic)

`web-tree-sitter` runs identically in browser, Node, and Bun from one build, so
the extraction logic itself has no Node dependency — only *supplying grammar
bytes* is per-environment.

- `src/grammar-loader.ts` — the port:
  ```ts
  export interface GrammarLoader {
    load(languageId: string): Promise<Uint8Array>
  }
  ```
- **No byte-offset conversion needed** (verified empirically, see "Lessons
  from cucumber/language-service" below): despite `web-tree-sitter`'s `.d.ts`
  describing node positions as byte offsets, `Parser.parse()` auto-selects
  UTF-16 input mode when given a plain JS string — which is what
  `discoverStepDefs(path, source: string)` always passes. Measured directly
  against `action('café {int} 🎉', ...)`: `node.startIndex`/`.endIndex` and
  `.startPosition.column`/`.endPosition.column` already land on UTF-16
  code-unit boundaries (a `🎉` counts as 2 columns, matching its surrogate-pair
  width in a JS string), identically to `ts.SourceFile.getLineAndCharacterOfPosition`.
  So `Range` conversion is just `{line: node.startPosition.row + 1, character:
  node.startPosition.column + 1}` — the same shape the current `rangeOf()`
  helper already produces, no separate utility module needed.
- `src/tree-sitter-queries.ts` — the per-language surface, as string constants
  (not `.scm` asset files — avoids a second asset-loading mechanism alongside
  `GrammarLoader` in the same sub-project). Capture names follow
  [cucumber/language-service](https://github.com/cucumber/language-service)'s
  convention (`@root`, `@function-name`, `@expression`, `@name`, `@name-key`,
  `@regexp-key`) rather than inventing new ones:
  - step-def calls: `context`/`action`/`sensor` call expressions with a
    **string-literal only** first argument (`@expression`), capturing the
    function name (`@function-name`) as `kind` and an optional arrow/function
    second argument for handler params. Var has no raw-regexp step
    definitions — only cucumber expressions — so, unlike
    cucumber/language-service's own step-definition query (which also matches
    `(regex)` and `(template_string)`, because Cucumber-JS supports regex step
    defs), this query has no such branch. This also matches the current
    TS-compiler scanner, which only accepts `ts.isStringLiteral`.

    **Anchoring matters.** `(arguments (string) @expression . (_)? @handler)`
    (no leading `.`) matches the *first string anywhere adjacent to another
    argument* — verified empirically that it wrongly matches
    `action(someVar, 'text', handler)`, capturing `'text'` as the expression
    even though it's argument index 1, not 0. The current TS-compiler scanner
    only ever looks at `node.arguments[0]`. Fixed with a leading anchor:
    `(arguments . (string) @expression . (_)? @handler)` — confirmed this
    correctly produces zero matches for that case while still matching all 12
    existing fixtures unchanged.
  - parameter types: `defineState(...)` calls whose second-argument object
    literal has entries with a `regexp` property (regex or string literal —
    this *is* a real regexp, since it defines a custom parameter type's
    matching pattern; unrelated to the "no regexp step defs" rule above).

  Node shapes verified empirically against `tree-sitter-typescript` 0.23.2 (see
  "Lessons from cucumber/language-service" for how): `call_expression` has
  `function`/`arguments` fields; a `required_parameter`'s `pattern` field is
  the name, its optional `type` field is a `type_annotation` node whose `.text`
  includes the leading colon (use `.namedChild(0).text` to get the bare type,
  e.g. `"number"` not `": number"`); `regex` has `pattern`/`flags` fields
  directly (no need to hand-parse trailing flags off `.text` like
  cucumber/language-service does).

  **String-literal decoding.** Unlike `ts.StringLiteral.text` (already
  decoded), a `string` node's children are the two quote tokens plus
  alternating `string_fragment` (verbatim text) and `escape_sequence` nodes —
  *not* a single flat run. Reconstructing the decoded value means walking the
  children: append `string_fragment` text verbatim, decode each
  `escape_sequence` (`\'`→`'`, `\"`→`"`, `\\`→`\`, `\n`→newline, `\t`→tab).
  Verified against `action('I said \'hi\'', ...)`, whose `string` node has
  children `(string_fragment "I said ") (escape_sequence "\'")
  (string_fragment "hi") (escape_sequence "\'")` — decoding to
  `I said 'hi'`. Gets its own test fixture (see Testing strategy).
- `src/tree-sitter-scanner.ts` — `createTreeSitterScanner(grammarLoader:
  GrammarLoader): Promise<StepDefScanner>`. Selects the `typescript` grammar
  for `.ts` files and `typescript-tsx` for `.tsx` files (see TSX below), memoizes
  the one-time `web-tree-sitter` runtime init (`Parser.init()`) at module scope
  so repeated calls (multiple test files, editor restarts) don't reinit
  redundantly, and returns sync `discoverStepDefs`/`discoverParameterTypes`
  closures running the compiled queries against `parser.parse(source)`.

### Why two grammars, not one

`tree-sitter-typescript` ships two distinct grammars: `typescript` (for `.ts`)
and `tsx` (for `.tsx`). They are not interchangeable: the `tsx` grammar treats
`<...>` as JSX first, which can misparse the legacy TS angle-bracket type
assertion (`<Foo>value`) that's valid in `.ts` but disallowed in `.tsx` (where
`as Foo` is required instead).

This is worse than an isolated misparse. Verified directly: parsing
```ts
const y = <string>value
action('a real step', () => {})
```
with the `tsx` grammar produces a single `ERROR` node that swallows the
*entire rest of the file* as JSX content — the step-definition query then
finds **zero** matches, versus 1 with the `typescript` grammar. One legacy
cast anywhere earlier in a step file would silently blank out every step
definition after it. That's not a rare edge case worth accepting — it's data
loss. Since both grammars live in the one `tree-sitter-typescript` npm
package, there's no real cost to building both and selecting by file
extension — this also means `.tsx` step files (e.g. a downstream project with
`steps: ['**/*.steps.tsx']` in its `var.config.ts`) work correctly from day
one, not just `.ts`.

### Grammar sourcing — depend on tree-sitter-typescript's own shipped wasm

Considered depending on a prebuilt wasm-grammar *bundle* (`tree-sitter-wasms`).
Rejected: the actively-published fork on npm is a single-maintainer rebundle
with no guarantee it tracks upstream grammar releases; the original
(`sourcegraph/tree-sitter-wasms`) is two years stale. Also considered building
our own via `tree-sitter-cli` (matching
[cucumber/language-service](https://github.com/cucumber/language-service)'s
`scripts/build.js`) — but checking the actual `tree-sitter-typescript` 0.23.2
npm package directly shows it already ships `tree-sitter-typescript.wasm` and
`tree-sitter-tsx.wasm` **in the package itself** (`"*.wasm"` is explicitly in
its `package.json` `files` array — a genuinely published asset, not something
a postinstall script generates). That makes building our own pointless
duplication: this is the canonical upstream grammar package's own asset, not a
third-party rebundle, so the staleness/bus-factor concern that ruled out
`tree-sitter-wasms` doesn't apply — it's a regular npm dependency with normal
version-pin semantics.

- `var-lsp` gets one new **dependency** (runtime, not dev):
  `tree-sitter-typescript` (0.23.2).
- `createNodeGrammarLoader()` (in `var-lsp`) resolves each `.wasm` file's path
  via `import.meta.resolve('tree-sitter-typescript/tree-sitter-typescript.wasm')`
  (and the `tsx` counterpart) — verified this works with no `exports` field
  restricting subpath access — then reads it with `node:fs/promises`. No build
  step, no committed binaries in this repo; bumping the `tree-sitter-typescript`
  dependency version is the only thing needed to pick up a grammar update.
- `web-tree-sitter` (the parser *runtime*, unrelated to grammar sourcing) is a
  regular dependency of `var-language`, since extraction itself must stay
  environment-agnostic.

### `var-lsp` — real dogfood

Mirrors the existing `FileSystem` port / `node-file-system.ts` pattern exactly:

- `src/node-grammar-loader.ts` — `createNodeGrammarLoader(): GrammarLoader`,
  resolves each grammar's `.wasm` path via `import.meta.resolve(...)` against
  the `tree-sitter-typescript` package and reads it with `node:fs/promises`.
- `store.ts` — add `grammarLoader: GrammarLoader` to `StoreDeps` (alongside
  `fs`). Memoize `createTreeSitterScanner(grammarLoader)` inside the
  already-async `reindex()` (first call pays the init cost; later calls reuse
  it) and pass the resolved scanner into `buildWorkspaceIndex(...)`.
  `createStore` itself stays synchronous — no signature change there.
- `bin.ts` — construct `createNodeGrammarLoader()` next to
  `createNodeFileSystem(root)`.
- `store.test.ts` (×3 call sites) and `handlers.test.ts` (×1) get the new
  `grammarLoader` field added to their deps (real loader — no fake needed,
  since the `.wasm` files are a real npm package asset, not something a test
  needs to vary).

`buildWorkspaceIndex`'s own default stays `createTypeScriptScanner()`.
`grammarLoader` on `StoreDeps` is optional — `var-lsp`'s own Node CLI/server
(`bin.ts`) supplies one and gets the tree-sitter scanner; a consumer without
one (the website's browser worker, which shares this same `store.ts` since
`@oselvar/var-lsp`'s package exports resolve to source) falls through to
`buildWorkspaceIndex`'s default and keeps using the TypeScript-compiler
scanner unchanged. `var-vscode` is untouched by this task entirely — it only
consumes `var-lsp`'s built `protocol` types and spawned binary, not
`store.ts` directly.

### Lessons from cucumber/language-service

Read the actual source, not just `scripts/build.js`, before finalizing this
design. Also independently ran `web-tree-sitter` 0.26.10 +
`tree-sitter-typescript` 0.23.2 directly (see scratch scripts referenced in
the implementation plan) against every existing test fixture, to verify
adopted patterns rather than take them on faith. Adopted:

- The query-string-with-named-captures pattern and its capture-name vocabulary
  (`@root`/`@function-name`/`@expression`/`@name`), rather than manual
  tree-walking. Verified end-to-end: real queries built on this pattern,
  run against all 12 existing fixtures plus 2 new ones, reproduce the
  TS-compiler scanner's output exactly.
- The quote-stripping + unescape steps needed to decode a `string` node's
  content (see above) — an easy-to-miss gap this design didn't originally
  cover, confirmed necessary and now verified against a real escaped-quote
  parse tree.

**Correction after empirical verification:** this design originally flagged
`helpers.ts`'s `createLocationLink` — which passes tree-sitter's raw
`startPosition.column` straight into an LSP `Range` — as evidence that
cucumber/language-service mishandles non-ASCII columns, and planned a
`byte-offset.ts` conversion utility to avoid the same bug. Measuring it
directly shows this concern doesn't apply: `web-tree-sitter`'s `Parser.parse()`
auto-selects UTF-16 input mode when given a plain JS string (which is what
both projects always pass), so `startPosition.column` already lands on
UTF-16 code-unit boundaries — the `.d.ts`'s "byte index" wording describes the
native C API's terminology, not the actual behavior for string input. Their
code is fine; so is skipping the conversion utility here. Retracting the
original claim rather than leaving a wrong critique of a third-party project
in a committed doc.

Explicitly declined:

- Their `NodeParserAdapter` (native node-tree-sitter) and `WasmParserAdapter`
  (web-tree-sitter) actually **disagree** on which grammar to use for
  TypeScript: the native adapter maps both `tsx` and `javascript` language
  names to the plain `typescript` grammar, while the wasm adapter maps them to
  the `tsx` grammar's `.wasm`. Their own `scripts/build.js` only builds `tsx`
  wasm — there is no `typescript.wasm` at all in their wasm distribution. This
  inconsistency in the reference implementation reinforces, rather than
  undermines, this design's choice to build *both* grammars and select
  correctly by extension (see "Why two grammars, not one") instead of picking
  one and hoping it doesn't matter.
- Their dual `ParserAdapter` (native bindings *and* wasm, switched per
  environment). `doc/ARCHITECTURE.md` already deliberately rejected native
  bindings in favour of one wasm extractor everywhere; nothing here changes
  that reasoning.
- Their unified `Language` object, which bundles the extraction queries
  *and* the snippet-template/parameters together per language. ARCHITECTURE.md
  §4 and §7 step 4 already deliberately keep `StepDefScanner` (extraction) and
  the future `SnippetEmitter` (generation) as separate ports; no reason to
  merge them.
- Their `treeByContent` cache, which parses a source once and reuses the tree
  for both the parameter-type and step-definition queries. Considered, but
  `buildWorkspaceIndex` calls `discoverParameterTypes` across *all* step files
  in one pass, then `discoverStepDefs` across all of them in a separate later
  pass — so a naive per-source cache wouldn't actually be hit for the real
  call pattern here, and an unbounded cache living inside a scanner instance
  that's memoized for the LSP server's entire lifetime (`store.ts` reindexes
  repeatedly as files change) risks a slow memory leak across long editing
  sessions. Not worth it without evidence double-parsing is a real bottleneck
  — and today's TS-compiler scanner already double-parses every file the same
  way, so this isn't a regression.

## Testing strategy

- Extract the 12 existing `step-defs.test.ts` cases into shared fixtures; run
  the same fixtures against both `createTypeScriptScanner()` and the new
  tree-sitter scanner (parity proof, avoids literal test duplication `jscpd`
  would flag).
- Add a fixture with non-ASCII expression text (accented characters, an emoji)
  asserting the reported `Range` matches the TS-compiler scanner's — locks in
  that no byte-offset conversion is needed, verified empirically above.
- A fixture with an angle-bracket cast followed by a real step definition in
  the same `.ts` file, asserting the step is still found — locks in that the
  `typescript` grammar (not `tsx`) is selected for `.ts` files. Verified
  empirically that using the `tsx` grammar here finds zero step defs (the
  cast's `ERROR` node swallows the rest of the file as JSX), while
  `typescript` finds the one real step def correctly.
- One fixture with an escaped quote inside the expression string (e.g.
  `action('I said \'hi\'', ...)`) to lock in the quote-stripping/unescape step.
- `var-lsp`'s existing `store.test.ts`/`handlers.test.ts` continue to pass
  unchanged (aside from the new `grammarLoader` field) — the integration-level
  parity proof.
- Gates: `pnpm -r build` (new `src/`) and `pnpm typecheck` / `pnpm check`
  (touched `tests/`).

## Out of scope (explicit follow-ups, per ARCHITECTURE.md §7 steps 3–7)

- `website` and `var-vscode` switching to the tree-sitter scanner — needs their
  own bundler-specific `GrammarLoader` (browser `fetch`, VS Code extension
  packaging) in a later sub-project.
- `StepDef.typeText` becoming a fully opaque string (currently a TS type as
  text — still TS-shaped until this happens).
- Extracting a `SnippetEmitter` port from the TS-emitting snippet code.
- De-hardcoding file-pattern config so a language's file extensions aren't
  assumed.
- Locking Model A vs B (ARCHITECTURE.md §3) for the Python execution seam.
- Standing up the language-agnostic conformance harness.

## Risks

- Grammar node shapes were verified against `tree-sitter-typescript` 0.23.2
  specifically; a future version bump could change them (tree-sitter grammars
  have shifted node shapes across versions before). Re-verify against the 12+
  fixtures when bumping the dependency — the shared-fixture test setup (see
  Testing strategy) makes this a fast check, not a re-design.
