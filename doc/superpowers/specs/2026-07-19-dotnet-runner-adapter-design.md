# .NET config + runner + VSTest adapter — design (sub-project 2 of the .NET port)

Date: 2026-07-19
Status: design, pending implementation (TDD)

The remaining runtime of the .NET port ([ADR 0008](../../adr/0008-dotnet-port.md)),
sitting on the already-conformance-green `Varar.Core` +
[facade](2026-07-19-dotnet-core-port-design.md), and landing on top of the
[Varar rename](../../RENAME-VARAR.md). Scope: the `Varar.Config` reader, the
`Varar.Runner` imperative shell, and the `Varar.TestAdapter` VSTest binding
([ADR 0009](../../adr/0009-dotnet-test-adapter-integration.md)). Python's pytest
plugin and Rust's cargo adapter are the closest precedents (full ports whose
runner/adapter sit on a proven core); read
[`2026-06-30-var-pytest-plugin-design.md`](2026-06-30-var-pytest-plugin-design.md)
and [`2026-07-12-rust-facade-runner-adapter-design.md`](2026-07-12-rust-facade-runner-adapter-design.md)
alongside.

## Why this scope

The facade proves the pipeline against the shared goldens; everything here is the
**imperative shell** the goldens can't police directly — file discovery, config
reading, failure rendering, drift persistence, and the `dotnet test` binding.
`Varar.Config` has its own byte-for-byte corpus; the runner is proven *through*
the green core; the adapter is proven by dogfooding the bundles against
`trace.json` and a drift fixture.

## Projects (target)

```
dotnet/
  Varar.Core/         # done (sub-project 1)
  Varar/              # facade + registry/plan/trace conformance gates (sub-project 1)
  Varar.Config/       # varar.config.json reader (own conformance corpus)
  Varar.Runner/       # discovery, load-steps, plan/run, render, filesystem BaselineStore
  Varar.TestAdapter/  # VSTest ITestDiscoverer/ITestExecutor (ADR 0009)
  Varar.sln
```

Purity gate (mirrors the Python/Rust grep gate): the adapter and runner contain
**no pipeline logic** — they delegate to `Varar.Core`; `Varar.Core` references
neither. Enforce via project-reference assertions in `make dotnet`.

### `Varar.Config`

- Strict, fail-loud reader of the canonical `{ docs: {include, exclude}, steps,
  snippets, scannerPlugins }` shape (globs; a file is a spec iff its path matches
  the `docs` globs — no special extension). Missing file → empty config;
  malformed / unknown-key / wrong-type → an error **starting with the config
  path**. `scannerPlugins` are name strings resolved to functions per-language
  via a name registry.
- Reuses `Varar.Core`'s `CanonicalJson` for its projection.
- **Done = reproduces `conformance/config/cases/*` (8 cases: `empty-object`,
  `full`, `invalid-json`, `minimal`, `no-config-file`, `null-values`,
  `unknown-key`, `wrong-type`) byte-for-byte** — `golden.json` via `CanonicalJson`,
  or the `expect-error.txt` marker → load must throw. Schema at
  `conformance/config/varar.config.schema.json`. Do not invent an
  ecosystem-idiomatic surface (no `.runsettings` schema, no `[tool.var]`-style
  table).

### `Varar.Runner`

- `FindSpecs`/`MatchSpec` using the hand-rolled `glob_to_regex` (`**`, `*`, `?`,
  `../`) that every other runner ports — **not** .NET's `Matcher`/platform glob,
  so semantics stay identical cross-language.
- `LoadSteps` (chains the facade `Register(Registry)` functions discovered for
  the workspace — via reflection over the test assembly's registration
  entry-points), `PlanSpec`, `RunSpec` (returns per-example run thunks),
  `RenderFailure` (reuses core diff payloads — `CellMismatchError`,
  `DocStringMismatchError`, `ReturnShapeError`, `UnexpectedPassError` — anchored
  to the `.md` span; never re-derived).
- Filesystem `IBaselineStore` (`varar.lock.json` read/write) + `ReconcileDrift`
  (core owns the format + `StringifyVarLock`/`ParseVarLock`). `async` handlers
  are awaited transparently by the executor; the runner adds no special casing.

### `Varar.TestAdapter` (VSTest — ADR 0009)

- `ITestDiscoverer` + `ITestExecutor`; `[FileExtension(".dll")]`,
  `[DefaultExecutorUri("executor://varar")]`; shipped as `Varar.TestAdapter.dll`
  so `dotnet test` auto-loads it on package reference (no user wiring).
- **Discovery:** locate `varar.config.json` from the test assembly / workspace
  root, glob the `.md` specs, parse+plan each via the runner, emit **one
  `TestCase` per `PlannedExample`** — `FullyQualifiedName = <spec-relative
  path>::<example name>` (stable, round-trips through `--filter` for
  re-run-single-test), `CodeFilePath` = the `.md`, `LineNumber` = the example's
  source line.
- **Execution:** delegate each leaf to the runner's `RunSpec`; map span-anchored
  core failures to `TestResult` with the `.md` location and the rendered diff.
- **Config:** the shared `varar.config.json` (via `Varar.Config`) — a
  `.runsettings` may carry the workspace root and the drift `VAR_UPDATE`
  parameter, but the canonical globs stay in `varar.config.json`.
- **Drift gate:** reconcile every spec against `varar.lock.json` via the runner's
  `IBaselineStore` + `ReconcileDrift`; a drifted example fails on the same rail
  as `ambiguous-match`; write the baseline on a clean run; honour a
  `VAR_UPDATE`/`.runsettings` acknowledgment ([ADR 0002](../../adr/0002-drift-detection-and-acknowledgment.md)).
  Add an adapter drift test with a `varar.lock.json` fixture (precedent: the
  pytest adapter's `tests/test_drift.py`, the Kotest adapter's `kotest-drift/`).
- **Language-neutral:** discovery keys off the built assembly + config globs, so
  the future **F#** facade reuses this adapter unchanged.

## Repo & release integration

Beyond the projects, wire the mechanical scaffolding (none of it exercised by the
conformance suite):

- **`dotnet/` workspace** (`Varar.sln`) + `global.json` pinning the LTS SDK.
- **`make dotnet`** running the full gate (build + test + `dotnet format
  --verify-no-changes` + the four golden gates + the config corpus + the example
  project), threaded into `check:`; update the Makefile header.
- **README coverage table:** add the port via `scripts/coverage-summary.sh` (a
  `DOTNET_JSON=$(port_json csharp "C#" …)` line + the `jq --slurpfile` entry + a
  `build_badge` case → `.github/workflows/dotnet.yml`); bump the "N ports" prose.
  Do not hand-edit the generated table.
- **`.github/workflows/dotnet.yml`** — triggered on `dotnet/**`,
  `conformance/**`, `examples/**`, and the workflow file; same gate as `make
  dotnet`, then the example project.
- **`examples/csharp-*/`** — a standalone consumer project (not a workspace
  member): depends on the released/locally-packed NuGet artifacts like a user's
  project, carries its own `varar.config.json`, and implements the
  feature-covering subset (`hello-var`, `deep-thought`, `tables-and-docstrings`,
  `yahtzee`, `roman-numerals`). Its `.md` specs are symlinks to the
  `typescript-vitest` originals (release sync dereferences them). Add a row to
  `examples/README.md`.
- **`release/targets/67-nuget.sh`** publishing the five packages to NuGet (slots
  between `65-crates-io.sh` and `70-varar-examples.sh`), plus the port's release
  channel; extend `70-varar-examples.sh` with a NuGet version-pin block (+
  lockfile exclusion). Extend `release/lint-commits.sh`'s `CONSUMER_SCOPE` regex
  with `dotnet` and `cliff.toml` with a `.NET (NuGet)` changelog section keyed
  `dotnet`.
- **`languages.json`:** a `csharp` entry (`label "C#"`, `icon "seti:c-sharp"`,
  `ext ".cs"`, `stepsGlob "varar-examples/**/*.steps.cs"`, `hasCli false`,
  install `dotnet add package Varar.TestAdapter`, scaffold `null`, run `dotnet
  test`) + add `csharp` to the `SiteLang` union.
- **Website:** a `<TabItem label="C#">` in every `<Tabs syncKey="lang">` across
  `reference/*` and `how-to/*` and the get-started tabs; a `<File>` tab per
  front-page `<Editor>` (`Editor.astro` build-asserts every `languages.json` port
  has one); add C# to `CM_LANGUAGE` in `cm-languages.ts` — no official Lezer
  `lang-csharp`, so use `StreamLanguage.define(csharp)` from
  `@codemirror/legacy-modes/mode/clike` (the kotlin/ruby legacy-mode route).
- **Tree-sitter dialect:** `typescript/packages/language/src/tree-sitter-dialects/csharp.ts`
  (`LanguageSpec`: step-def + parameter-type queries over the injected-Registrar
  method-call shape, `decodeString`, `extractHandlerParams`, `resolveRegexp`)
  using the `tree-sitter-c-sharp` grammar, queries verified empirically; wire
  into `tree-sitter-scanner.ts` (`SPECS`/`EXTENSIONS`/`LanguageId`), both grammar
  loaders (`packages/lsp`, `packages/language` test loader), the VS Code bundler
  copy list (`packages/vscode/esbuild.mjs`), and both `knip.json` ignore blocks.
  Prove with `extraction-conformance.test.ts` + `tree-sitter-scanner-csharp.test.ts`;
  `language-coverage.test.ts` is the gate.

## Non-goals (this sub-project)

- Snippet / step-def generation (deferred, per skill).
- A `varar` CLI (`varar init`) — not on the core/runner/adapter path;
  `hasCli:false`.
- Per-example fixture-lifecycle teardown beyond what VSTest gives for free.
- The **F#** facade — a later sub-project over this same C# engine + adapter
  (its own ADR/design), registry-only conformance (Kotlin-over-Java route).
- A native **Microsoft.Testing.Platform** entry point — VSTest (with MTP's
  compatibility bridge) is the v1 target; native MTP is additive later.

## References

- [ADR 0008 — .NET port](../../adr/0008-dotnet-port.md),
  [ADR 0009 — VSTest adapter](../../adr/0009-dotnet-test-adapter-integration.md)
- [Varar rename plan](../../RENAME-VARAR.md)
- [.NET core + facade design](2026-07-19-dotnet-core-port-design.md)
- [var-pytest plugin design](2026-06-30-var-pytest-plugin-design.md),
  [Rust runner/adapter design](2026-07-12-rust-facade-runner-adapter-design.md)
