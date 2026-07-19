# .NET config + runner + VSTest adapter — task plan (sub-project 2 of the .NET port)

**REQUIRED SUB-SKILL:** superpowers:executing-plans or
superpowers:subagent-driven-development. Load the
[`adding-a-language-port`](../../../.claude/skills/adding-a-language-port/SKILL.md)
skill.

Design: [`2026-07-19-dotnet-runner-adapter-design.md`](../specs/2026-07-19-dotnet-runner-adapter-design.md).
ADRs: [0008](../../adr/0008-dotnet-port.md) (port),
[0009](../../adr/0009-dotnet-test-adapter-integration.md) (VSTest adapter).
Builds on the [Varar rename](../../RENAME-VARAR.md).

## Goal

Bring the .NET port from "core + facade conformance-green" to a **complete port**:
`Varar.Config` (corpus green), `Varar.Runner`, the `Varar.TestAdapter` VSTest
binding, a C# tree-sitter dialect, and full repo/release integration — with a
standalone `examples/csharp-*` sample running on the shipped packages.

## Depends on

[Sub-project 1](2026-07-19-dotnet-core-port.md) complete: all four conformance
artifacts × 15 bundles + drift green.

## Global constraints

- **Translate, don't redesign**; the runner/adapter contain **no pipeline
  logic** — delegate to `Varar.Core` (project-reference/grep gate).
- Reuse the core's diff/`to_failure` payloads for failure rendering — never
  re-derive failure text in the adapter.
- Each task ends green + `dotnet format --verify-no-changes` + one commit.
- Commits `chore(dotnet)`/`docs(dotnet)`/`test(...)` until P5 lands the NuGet
  target; only then `feat(dotnet/<pkg>)`.

## Dependency order

`P1` (config) and `P4` (tree-sitter, TS-side) are independent — schedule
anytime. `P2` → `P3` → `P5` → `P6`.

---

### P1 — `Varar.Config` (S/M)
1. Strict/fail-loud reader of `{docs:{include,exclude}, steps, snippets,
   scannerPlugins}`; missing file → empty; malformed/unknown-key/wrong-type →
   error starting with the config path. Reuse core `CanonicalJson`.
2. **Reproduce `conformance/config/cases/*` (8) byte-for-byte** (`golden.json`
   via `CanonicalJson`, or `expect-error.txt` → load throws; schema at
   `conformance/config/varar.config.schema.json`). **Exit: 8/8.**

### P2 — `Varar.Runner` (M)
1. `glob_to_regex` (`**`, `*`, `?`, `../`) + `FindSpecs`/`MatchSpec` — port the
   shared semantics, not .NET's platform glob (translate the runner glob tests).
2. `LoadSteps` (reflect over the assembly's `Register(Registry)` entry-points),
   `PlanSpec`, `RunSpec` (per-example thunks; `async` handlers awaited),
   `RenderFailure` (reuse core diff payloads, `.md`-anchored).
3. Filesystem `IBaselineStore` (`varar.lock.json` read/write) + `ReconcileDrift`;
   re-use the core `Hash`/`Drift` unit tests and add a runner-level drift test.

### P3 — `Varar.TestAdapter` (M/L) — ADR 0009
1. `ITestDiscoverer` + `ITestExecutor`; `[FileExtension(".dll")]`,
   `[DefaultExecutorUri("executor://varar")]`; ships as `Varar.TestAdapter.dll`
   (auto-load).
2. Discovery: locate `varar.config.json`, glob specs, plan via the runner, emit
   one `TestCase` per example (stable `FullyQualifiedName`, `.md` `CodeFilePath`/
   `LineNumber`). Execution: delegate to `RunSpec`, map span-anchored failures to
   `TestResult`.
3. Drift `TestCase`s + `VAR_UPDATE`/`.runsettings` acknowledgment; add a
   `varar.lock.json` drift fixture test.
4. **Verify against a real sample** (P5): auto-load under `dotnet test`,
   `--filter` selects a single example, re-run-single-test round-trips.

### P4 — Tree-sitter dialect (M) — independent, TS-side
1. `typescript/packages/language/src/tree-sitter-dialects/csharp.ts`
   (`LanguageSpec`: step-def + param-type queries over the injected-Registrar
   method-call shape, `decodeString`, `extractHandlerParams`, `resolveRegexp`) on
   `tree-sitter-c-sharp`, queries verified against the real grammar.
2. Wire: `tree-sitter-scanner.ts` (`SPECS`/`EXTENSIONS`/`LanguageId`), both
   grammar loaders (`packages/lsp`, `packages/language` test loader), the VS Code
   bundler copy list (`packages/vscode/esbuild.mjs`), both `knip.json` ignore
   blocks.
3. Prove: `extraction-conformance.test.ts` (identical `(kind, expression)` /
   `(name, regexp)` sets as TS on every `*.steps.cs`) +
   `tree-sitter-scanner-csharp.test.ts`. **Exit: `language-coverage.test.ts` green.**

### P5 — Repo + release integration (M)
1. `languages.json`: `csharp` entry (label `C#`, icon `seti:c-sharp`, `ext .cs`,
   stepsGlob `varar-examples/**/*.steps.cs`, `hasCli:false`, install `dotnet add
   package Varar.TestAdapter`, scaffold `null`, run `dotnet test`) + add `csharp`
   to the `SiteLang` union.
2. Website: `<TabItem label="C#">` across `reference/*`, `how-to/*`, get-started
   tabs; a `<File>` per front-page `<Editor>`; add C# to `CM_LANGUAGE`
   (`StreamLanguage.define(csharp)` from `@codemirror/legacy-modes/mode/clike`).
3. `examples/csharp-*/` standalone consumer (feature-covering subset; `.md`
   symlinks to `typescript-vitest`; own `varar.config.json`); `examples/README.md`
   row.
4. `release/targets/67-nuget.sh` publish target + release channel → the
   `70-varar-examples.sh` NuGet pin block goes live; `release/lint-commits.sh`
   `CONSUMER_SCOPE` regex + `cliff.toml` NuGet section add `dotnet`.
5. `make dotnet` + `.github/workflows/dotnet.yml`: build/test all projects, run
   the four gates + config corpus + the sample; thread into `check:`; README
   coverage row via `scripts/coverage-summary.sh`; bump the "N ports" prose.

### P6 — Full-port verify (S)
4 artifacts × 15 bundles + config corpus 8/8 byte-for-byte; drift green;
`language-coverage` green; sample on real packages green; `make dotnet` +
`dotnet.yml` green. Update the
[`adding-a-language-port`](../../../.claude/skills/adding-a-language-port/SKILL.md)
status line to list .NET/C# as complete. Note **F#** as the next facade over this
engine (Kotlin-over-Java route; reuses `Varar.TestAdapter`).

## Risks

- **VSTest identity/round-trip** — stable `FullyQualifiedName` + `.md`
  `TestSource` must round-trip through `--filter`; verify on the real sample
  (the VSTest analog of ADR 0003's `UniqueId` risk).
- **Adapter auto-load** — confirm `*.TestAdapter.dll` is discovered by `dotnet
  test` without user wiring on the sample, not just in unit tests.
- **NuGet package-id availability** — check the five ids before P5.
- **MTP** — VSTest runs under the MTP compatibility bridge today; a native MTP
  entry point is deferred, not required for v1.
