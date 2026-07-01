# Config-driven step-file recognition (var-vscode + website-starlight)

Date: 2026-07-01
Status: design, pending implementation (TDD)

Third sub-project of ADR 0001's tree-sitter/multi-language prefactoring
sequence, per [`doc/ARCHITECTURE.md`](../../../doc/ARCHITECTURE.md) §7 step 5:
"de-hardcode file patterns into per-language config." Follows the
[tree-sitter `StepDefScanner`](2026-07-01-treesitter-lsp-scanner-design.md)
and [`SnippetEmitter` port](2026-07-01-snippet-emitter-port-design.md)
sub-projects.

## Scope

Investigated every hardcoded `.steps.ts` literal across the workspace before
scoping this. Several are legitimate and stay untouched: demo-content file
imports in `website`/`website-starlight` (`hello-var.steps.ts`,
`yahtzee.steps.ts` — fixed TypeScript example content, bundled at build time,
unrelated to what a *user's* project might be written in), and
TypeScript-diagnostics test fixtures (`ts-diagnostics.test.ts` — inherently
TS-scoped, not a step-file-recognition concern). The five that are real
"assumes TypeScript" bugs, all fixed here:

1. `var-vscode/src/extension.ts:56` — `documentSelector` pattern passed when
   registering the client (also duplicated at line 293 for
   `registerRenameProvider`).
2. `var-vscode/src/extension.ts:135` — the "no step files found" warning
   message.
3. `var-vscode/src/extension.ts:154` — `findStepFiles`'s stale fallback
   (`stepGlobs.length > 0 ? stepGlobs : ['**/*.steps.ts']`), even though this
   function already receives real `stepGlobs` from the LSP.
4. `website-starlight/src/lib/run-grouping.ts:46` — filters an editor group's
   views down to "the step-def files" via `.endsWith('.steps.ts')`.
5. `website-starlight/src/scripts/editor-mount.ts` — the `stepsView` finder,
   same `.endsWith('.steps.ts')` check.

**`website` (the package `website-starlight` is strangler-fig-replacing) is
explicitly out of scope** — same bug exists there (`run-grouping.ts`,
`editor-mount.ts`), but since `website-starlight` is the near-future
replacement, fixing the package being retired isn't worth the effort.

**`website-starlight/src/scripts/editor-mount.ts`'s CodeMirror
syntax-highlighting selector (`file.uri.endsWith('.ts') ? 'typescript' :
'markdown'`) is explicitly out of scope** — mapping a file extension to a
syntax-highlighting mode is a fundamentally different concern from
recognizing step-definition files. It always needs its own extension→mode
table regardless of what the `steps` glob is configured to; there's no
"config-driven" version of it to build here.

## Why `website-starlight` needs more than a literal swap

Unlike `var-vscode` (which already fetches real `stepGlobs` from the LSP via
`lspClient.sendRequest('var/stepGlobs')` for `findStepFiles`, per item 3
above), `website-starlight`'s browser worker never exposes `stepGlobs` over
the wire in the first place — even though the shared `var-lsp` server code it
runs already handles that request identically to the Node case (`var-lsp`'s
`registerHandlers`/`server.ts` is the same module in both environments,
confirmed by both `website`'s and `website-starlight`'s `var-worker.ts`
importing it from `@oselvar/var-lsp`). This is purely a missing client-side
call, not a missing server capability.

Confirmed technically feasible: `website-starlight` uses
`@codemirror/lsp-client`'s `LSPClient` (not `vscode-languageclient`, which
`var-vscode` uses), but it exposes the same shape of capability —
`request<Params, Result>(method: string, params: Params): Promise<Result>` —
so `client.request('var/stepGlobs', {})` works the same way
`var-vscode`'s `sendRequest('var/stepGlobs')` already does.

**The practical payoff differs from `var-vscode`'s.** `website-starlight`'s
demo content is fixed TypeScript (`hello-var.steps.ts`, `yahtzee.steps.ts`,
imported via `?raw` at build time) regardless of this change — a real
non-TypeScript project can't be loaded into the browser demo today or in any
near-term plan. So the value here is DRY/consistency — one source of truth
for "is this a step file," derived from the worker's own config, instead of
the same literal independently duplicated in `run-grouping.ts` and
`editor-mount.ts` — not "the demo now supports Python." `var-vscode`'s side
is where the functional payoff (a real user's non-TypeScript workspace
working correctly) actually lives.

## Approach

### `var-vscode`

`activate()`'s sequencing changes: start the LSP client, **await** the
`var/stepGlobs` response, *then* register the document-selector-scoped
providers (client registration, `registerRenameProvider`) with the real
globs — not a same-tick literal swap. This delays those providers' UI
availability until after the round-trip completes, which is correct: a
provider scoped to the wrong file pattern is worse than one that's briefly
unavailable at startup.

`findStepFiles`'s fallback is deleted outright (not replaced with a
different fallback). An empty `stepGlobs` response means the server
genuinely found no step globs configured (or, in principle, a misconfigured
`steps: []`) — searching for nothing and reporting that accurately is
correct; silently falling back to a hardcoded TypeScript-specific pattern
would misrepresent a real project's actual configuration, exactly the kind
of thing this whole sub-project exists to stop doing.

The warning message at line 135 formats the actual configured globs instead
of a hardcoded string, e.g. distinguishing "no step files matching your
configured glob(s)" from a generic message — exact wording is an
implementation detail for the plan.

### `website-starlight`

1. Add the one-time `client.request('var/stepGlobs', {})` call to
   `editor-mount.ts`, following the same one-shared-client,
   fetch-once-up-front pattern already used for `collectPageSeed()`.
2. Add a small, shared "does this URI match one of these globs" helper using
   the same crude extension-suffix approach `memory-file-system.ts`'s
   `matches()` already uses (`globs.map(g => g.slice(g.lastIndexOf('.')))`,
   then `.some(ext => uri.endsWith(ext))`) — not a new real-glob-matching
   dependency. Where exactly this helper lives (inlined at each call site,
   or extracted to a shared module both `run-grouping.ts` and
   `editor-mount.ts` import) is a file-structure decision for the plan, not
   fixed here — two call sites is not yet strong evidence a shared
   abstraction pays for itself over two inline copies, but it's close enough
   that the plan should look at both call sites side by side before
   deciding.
3. `run-grouping.ts`'s `groupRunInputs` gains a `stepGlobs: ReadonlyArray<string>`
   parameter, replacing the `.endsWith('.steps.ts')` filter with the new
   helper.
4. `editor-mount.ts`'s `stepsView` finder closure captures the fetched
   `stepGlobs` (from step 1) instead of hardcoding the check.

## Testing

Neither `var-vscode` nor `website-starlight` has any existing test files.
`var-vscode` has no test harness at all (VS Code extension testing needs the
VS Code test runner, out of scope to stand up here) — verification there is
type-check plus manual reasoning about the sequencing change.

`website-starlight`, by contrast, gets real unit-testable pure logic out of
this change (the glob-matching helper, `groupRunInputs`'s filter). This is a
natural place to add the package's first tests, mirroring `website`'s
existing (superseded but still-present) `run-grouping.test.ts` fixture
style — same test cases, adapted to the new `stepGlobs`-parameterized
signature, plus new cases proving a non-`.steps.ts` glob (e.g.
`**/*.steps.py`) is recognized correctly now that the check is config-driven
instead of hardcoded.

## Out of scope

- Fixing `website` (superseded by `website-starlight`).
- `editor-mount.ts`'s syntax-highlighting language-mode selector (different
  concern, see above).
- Any actual Python `.steps.py` support in either package's UI — this only
  removes the hardcoded assumption that would silently break it; no Python
  LSP integration exists yet (see the tree-sitter design doc's own
  out-of-scope list).
- `var-core/config.ts`'s own `DEFAULT_CONFIG.steps = ['**/*.steps.ts']`
  default value — that's a legitimate, overridable default, not a hardcoded
  bypass of config; nothing here changes it.
