# Multi-language authoring support: unified config + tree-sitter scanners for Python, Java, Kotlin

**Date:** 2026-07-02
**Status:** Sub-projects A–D implemented
**Realizes:** ADR 0001's "shared LSP with tree-sitter adapters" direction and its
"per-language fixtures, shared expectations" conformance strategy for the
step-definition extraction seam.

## Goal

Make the shared authoring platform (LSP, VS Code extension, snippet generation)
work end to end for step definitions written in Python, Java, and Kotlin — not
just TypeScript — with every cross-language behavior proven by the shared
conformance corpus.

Today only the TypeScript grammars/queries exist in the tree-sitter scanner
(`typescript/packages/var-language/src/tree-sitter-scanner.ts`), the LSP only
loads `var.config.ts`, and the VS Code extension only activates for
markdown/TypeScript. The runtimes for all four languages already exist and pass
the bundle conformance suite.

## Shape: four sub-projects

Each sub-project lands green on trunk and gets its own implementation plan.
Order: **A → B → C → D** (B may land in parallel with A; C needs B's fixtures;
D needs A's config and C's scanners).

| # | Sub-project | Delivers |
|---|-------------|----------|
| A | Unified `var.config.json` | One JSON config format; three thin readers (TS/Python/Java+Kotlin); old formats deleted; config conformance fixtures |
| B | Custom-parameter-type bundle | `conformance/bundles/13-custom-parameter-type/` with fixtures in all four languages + goldens; first coverage of `registry.json`'s `parameterTypes` |
| C | Tree-sitter scanners | Python/Java/Kotlin grammars + queries behind the existing `GrammarLoader`/`StepDefScanner` ports; extraction conformance test |
| D | Authoring surface | Per-language snippet templates; LSP/VS Code wiring for `.py`/`.java`/`.kt`; wasm packaging |

Decision log (from the brainstorm):

- Full end-to-end scope (scanner + config + VS Code), not scanner-only.
- `var.config.json` **fully replaces** `var.config.ts`, `pyproject.toml
  [tool.var]`, and the Java `var.*` properties — pre-1.0, no fallbacks.
- Scanner plugins in config are **named strings** resolved per-language.
- LSP features in scope for the new languages: snippet generation **and**
  handler-param extraction (signature sync), on top of the automatic ones.
- Java's parameter-type API already exists
  (`Registrar.defineParameterType(String, Pattern, Function)`, landed with the
  Kotlin port), so B is a conformance bundle, not new API work.
- Kotlin (landed on main 2026-07-02) is a first-class fourth language
  throughout.

---

## Sub-project A: unified `var.config.json`

### Schema

One file, `var.config.json`, at the tool's root (where `var.config.ts` sits
today). Canonical shapes only — no shorthand forms, so three readers stay
trivially conformant:

```json
{
  "docs": { "include": ["specs/**/*.md"], "exclude": ["specs/wip/*.md"] },
  "steps": ["**/*.steps.ts", "**/*_steps.py"],
  "snippets": { "typescript": "…", "python": "…" },
  "scannerPlugins": ["gherkinTables", "gherkinDocStrings"]
}
```

- The spec-discovery key is named **`docs`** (formerly `vars` in
  `var.config.ts`). The readers rename their config field to match
  (e.g. `VarConfig.docs`), so the JSON key and the code speak one language;
  call sites like the LSP store's `isVarDoc` follow the rename.
- All keys optional. Missing file or missing key = empty (`docs`/`steps`
  empty arrays, no snippets, no plugins). The old TS-only default
  `steps: ["**/*.steps.ts"]` dies with the TS-only format — a repo must
  declare its step globs, exactly as it must declare `docs` today.
- `snippets` is a flat map keyed by language id (`typescript`, `python`,
  `java`, `kotlin`) from day one so the schema never churns; until
  sub-project D, readers only consume the `typescript` key.
- A JSON Schema, `conformance/config/var.config.schema.json`, is the
  machine-readable contract (editor validation via `$schema`, reader tests).

### Readers

Each language keeps its existing `VarConfig` public type so consumers are
untouched:

- **TypeScript** — `@oselvar/var-config`'s `loadVarConfig` parses JSON instead
  of dynamic-importing a module. Plugin names resolve to `ScannerPlugin`
  functions through a name→plugin registry exported by `var-core`
  (`gherkinTables`, `gherkinDocStrings`); an unknown name is a load error.
  Delete the `var.config.ts`/`.js`/`.mjs` candidates path.
- **Python** — new `var_config` package in the uv workspace, extracted from
  `var_runner.config`; `[tool.var]` reading deleted.
- **Java** — new `var-config` Maven module; `VarConfig.java`'s properties-key
  path deleted. Kotlin consumes this module (it lives in the same Maven
  workspace and is driven by the same runner). JSON parsing approach (Jackson
  vs. minimal hand-rolled, mirroring the canonical-JSON writer) is decided at
  plan time based on the port's existing dependency posture.

### Error handling

Malformed JSON or schema-invalid values fail loudly with file path and reason.
No silent fall-back to defaults: a typo'd config that quietly discovers nothing
is the failure mode this design refuses. A *missing* file remains legal and
means "empty config", preserving today's behavior.

### Conformance

`conformance/config/` holds fixture configs — full, minimal, empty object,
missing file, malformed JSON / wrong types / unknown keys (error cases) —
plus golden canonical-JSON dumps of the parsed result (plugin *names*, not
resolved functions). An unknown plugin *name* is deliberately not a corpus
case: names are opaque at parse time in every port; only TypeScript resolves
them (at load), covered by its own unit test. Every
port's harness parses each fixture and must match the golden byte-for-byte,
same as the bundles.

### Migration in this repo

`typescript/var.config.ts` (two glob arrays, pure data) becomes
`typescript/var.config.json`. Python/Java runner-test config fixtures move to
the new format. `make check` green in the same commit series.

---

## Sub-project B: custom-parameter-type conformance bundle

New bundle `conformance/bundles/13-custom-parameter-type/`:

- `example.md` exercising a custom `{airport}` parameter
  (regexp `[A-Z]{3}`, transformer wrapping the raw capture).
- Four steps fixtures using each language's **existing** API:
  - `airports.steps.ts` — `defineState(() => ({}), { airport: { regexp: /[A-Z]{3}/, transformer: … } })`
  - `airports.steps.py` — `define_state(lambda: {}, param_types={"airport": {"regexp": …, "transformer": …}})`
  - `AirportsSteps.java` — `registrar.defineParameterType("airport", Pattern.compile("[A-Z]{3}"), …)`
  - `airports.steps.kt` — `parameterType("airport", Regex("[A-Z]{3}")) { … }` inside the `defineState` block
- Goldens: `registry.json` (first bundle where `parameterTypes` is non-empty —
  name + regexp source), `plan.json`, and run output like every other bundle.

Every port's existing conformance harness picks the bundle up automatically,
at the stage each port gates on: registry + plan + run for TypeScript, Python,
and Java; **registry stage only for Kotlin** (its `ConformanceTest.kt` is
deliberately registry-stage — parse/plan/trace are proven by the Java engine
underneath, per the Kotlin facade design). Any gap the bundle exposes (e.g. a
harness compiling steps before registering custom types) is fixed as part of
B. The fixtures double as sub-project C's
parameter-type extraction test corpus.

---

## Sub-project C: tree-sitter scanners for Python, Java, Kotlin

### Grammar loading and dialect routing

`GrammarLoader.load(languageId)` is unchanged. `createTreeSitterScanner` grows
a dialect table keyed by file extension:

| Extension | languageId | Grammar source |
|-----------|------------|----------------|
| `.ts` | `typescript` | `tree-sitter-typescript` (existing) |
| `.tsx` | `typescript-tsx` | `tree-sitter-typescript` (existing) |
| `.py` | `python` | `tree-sitter-python` (prebuilt wasm in npm package) |
| `.java` | `java` | `tree-sitter-java` (prebuilt wasm in npm package) |
| `.kt` | `kotlin` | community grammar (`fwcd/tree-sitter-kotlin`) |

Dialects load **lazily on first use** — a TS-only workspace never fetches the
other wasm files. `var-lsp`'s `createNodeGrammarLoader` maps each id to its
wasm file.

**Risk (resolved during sub-project C):** `@tree-sitter-grammars/tree-sitter-kotlin@1.1.0`
ships a prebuilt `.wasm` directly from npm, so no vendoring or provenance
tracking was needed — it loads the same way as the first-party Python/Java
grammars.

### Queries

Each language contributes the same pair the TS dialect has — a step-definition
query and a parameter-type query — plus handler-param extraction. Capture-name
conventions (`@root`, `@function-name`, `@expression`, `@name`) carry over.
`StepDef`, `ParameterTypeDef`, `HandlerParams` in
`packages/var-language/src/step-defs.ts` are **unchanged** — the extraction
seam holds exactly as ADR 0001 drew it.

- **Python** — a step def is a `decorated_definition` whose decorator is a call
  `@context|action|sensor("expr")`; the handler is the decorated
  `function_definition` (its params include `state` first, mirroring `ctx` in
  TS; `typeText` from annotations when present). Parameter types come from
  `define_state(…, param_types={"name": {"regexp": …}})` — dict-literal keys;
  regexp from a string literal or `re.compile("…")` argument.
- **Java** — a step def is a `method_invocation` named
  `context|action|sensor` with a string-literal first argument; the receiver is
  deliberately unconstrained (any binder variable name). Handler params from
  the lambda's typed parameter list. Parameter types from a
  `method_invocation` named `defineParameterType`: name from the string
  literal, regexp from the `Pattern.compile("…")` argument.
- **Kotlin** — a step def is a `call_expression` named
  `context|action|sensor` with a string first argument and a trailing-lambda
  handler; handler params from the lambda's parameter list (the state is the
  *receiver*, so — unlike the other languages — it does not appear in the
  list). Parameter types from `parameterType("name", Regex("…"), …)`.

Like the TS scanner, expression captures are **string literals only** (no
regexp/template/f-string branches — Var has no raw-regexp step definitions).
String decoding is implemented per dialect, since escape rules differ per
language (same empirical care as the existing `decodeString` /
`decodeEscapeSequence`).

### Testing

- Per-language scanner unit tests alongside the existing
  `tree-sitter-scanner.test.ts` (fixtures covering escapes, multiple defs per
  file, non-step calls that must NOT match, handler-param shapes).
- **Extraction conformance test:** for every bundle in
  `conformance/bundles/`, scan each language's steps fixture and assert the
  identical `(kind, expression)` set across languages — and, for bundle 13,
  the identical parameter-type `(name, regexp)` set. This is ADR 0001's
  "per-language fixtures, shared expectations" applied to the extraction seam.

---

## Sub-project D: authoring surface

### Snippet generation

`var-language`'s snippet emitter gains one default template per language
(`typescript`, `python`, `java`, `kotlin`), overridable via A's `snippets`
map. The LSP server picks the emit language from the config and returns it
in the `var/generateSnippet` response (`GenerateSnippetResult.language`):

1. Derive the language of each glob in `config.steps` from its extension
   (`.ts`/`.tsx` → typescript, `.py` → python, `.java` → java, `.kt` →
   kotlin).
2. If exactly one language is configured, use it.
3. If more than one is configured, count the indexed step files per language
   (the files discovered by `config.steps`) and pick the language with the
   most files.
4. On a tie, pick the language that appears **first in `config.steps`
   order**.

The "append to which steps file?" quick-pick is then filtered to files of
the picked language, so the rendered snippet and the target file can never
disagree.

### LSP

No protocol changes. With A (config) and C (scanners) in place, `.py`/`.java`/
`.kt` step files flow through indexing, and every above-the-seam feature — go-to-def,
completion, match highlighting, diagnostics, rename with handler-signature
sync — works from the extracted `StepDef`s, including `handlerParams`.

### VS Code

- `documentSelector` and rename-provider registration cover the four
  step-file conventions as static patterns (`**/*.steps.ts`, `**/*.steps.py`,
  `**/*.steps.kt`, `**/*Steps.java`). Deriving them dynamically from the
  server-reported `steps` globs (the `var/stepGlobs` request already exists)
  is a possible follow-up for workspaces with unconventional globs.
- `activationEvents` add `onLanguage:python`, `onLanguage:java`,
  `onLanguage:kotlin`.
- Packaging: the release system's self-contained .vsix (esbuild-bundled
  extension + LSP server) copies all five grammar wasm files flat next to
  the server bundle and points the grammar loader at them via
  VAR_GRAMMAR_DIR (typescript/packages/var-vscode/esbuild.mjs). The dev
  install (typescript/scripts/install-vscode.mjs symlink) resolves the same
  wasm files through the workspace's node_modules.
- `innerStringRange` (quote stripping for rename) already handles `"`/`'`
  and needs no per-language change.

---

## Out of scope

- Config formats other than `var.config.json` (no TOML/YAML/properties).
- Third-party scanner plugins (the name registry is fixed to the built-ins
  for now).
- Parameter-type extraction beyond literal shapes (e.g. a regexp held in a
  variable) — matches the TS scanner's existing literal-only stance.
- Lifecycle hooks, tags, Gherkin AST — unchanged per CLAUDE.md.
- LSP config-file *watching*/hot-reload changes beyond what exists today.

## Success criteria

1. A repo with only `var.config.json` + `.py`/`.java`/`.kt` step files gets
   full LSP behavior (diagnostics, go-to-def, completion, rename, snippets)
   in VS Code with no TypeScript anywhere in the workspace.
2. All three ports parse every `conformance/config/` fixture identically
   (golden byte-for-byte).
3. Bundle 13 passes conformance in all four languages at each port's gate
   stage (registry/plan/run for TS/Python/Java; registry for Kotlin).
4. The extraction conformance test proves identical `(kind, expression)` and
   parameter-type sets across all four languages for every bundle.
5. `make check` green; no port keeps a legacy config path.
