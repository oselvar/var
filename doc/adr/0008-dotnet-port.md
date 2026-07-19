# ADR 0008 — .NET (C#) as the seventh language port (full pipeline)

- **Status:** Proposed
- **Date:** 2026-07-19
- **Deciders:** Aslak Hellesøy
- **Tags:** dotnet, csharp, fsharp, cross-language, port

## Context

TypeScript (reference), Python, Java, Kotlin, Ruby, and Rust are complete ports
(ADRs [0001](0001-second-language-python.md), [0004](0004-ruby-port.md),
[0006](0006-rust-port.md)). .NET is picked up next. Per the
[`adding-a-language-port`](../../.claude/skills/adding-a-language-port/SKILL.md)
skill, the first decision is mechanical: **does the target share a runtime with
an already-ported language?** The CLR does not overlap the JS, CPython, JVM,
Ruby, or Rust-native runtimes, so — like Python, Ruby, and Rust, and unlike
Kotlin-over-Java — the .NET port is a **full pipeline port** gated on all four
conformance artifacts, not a facade over an existing engine.

The .NET runtime hosts **two** languages we care about — C# and F# — the same
way the JVM hosts Java and Kotlin. This ADR settles that pairing up front (the
skill requires deciding **which language owns the engine before starting the
first of the two**): **C# is the full pipeline port and owns the CLR engine;
F# is a later facade over it** (registry-only conformance, the Kotlin-over-Java
route — see *Consequences*).

This port lands **on top of the [Varar rename](../RENAME-VARAR.md)** (PR #39):
the project is `Varar` (was `Vár`/`@oselvar`), packages publish under the `varar`
base name, product tokens are `varar.config.json` / `varar.lock.json`, and
example specs live in `varar-examples/`. All .NET coordinates below already use
the post-rename scheme.

### Why .NET, why now

- A **managed-runtime port on the CLR** reaches the large .NET testing
  ecosystem (xUnit / NUnit / MSTest / Reqnroll users, all driven by
  `dotnet test`) that none of the existing ports touch.
- C# is the project's **third statically-typed** target after Java/Kotlin,
  validating a second time that the settled static-language author-API forks
  (injected Registrar, full-replacement state) generalize beyond the JVM.
- C# `string`/`char` are **UTF-16 code-unit indexed**, identical to JS and the
  JVM, so the port's single riskiest area for Python (the UTF-16 conversion
  layer) is expected to be free here — the parse stage should be comparatively
  cheap (verified against bundles `11-emoji-offsets` / `12-combining-marks`,
  not assumed).
- It sets up the **F#-over-C#** facade, giving the .NET community both an
  imperative and a functional authoring surface at low marginal cost, exactly
  as Kotlin did over Java.

## Decision

.NET (C#) is a **full pipeline port** against the TypeScript reference, gated on
all four conformance artifacts (`var-doc`, `registry`, `plan`, `trace`) × 15
bundles plus the config corpus, with drift unit-gated. The package shape mirrors
the other full ports, in .NET/NuGet idiom. NuGet has no scope mechanism, so —
like PyPI/RubyGems/crates in the rename table — packages keep a `Varar` base and
drop only the redundant infix (facade = the bare base name, others =
`Varar.<Leaf>`):

| Package (NuGet id / root namespace) | Role |
|---|---|
| `Varar.Core` | pure pipeline + diffs + drift/hash + conformance projections |
| `Varar` | author facade (registry glue) **and** the three deferred `registry`/`plan`/`trace` golden gates |
| `Varar.Config` | `varar.config.json` reader (own conformance corpus) |
| `Varar.Runner` | discovery, load-steps, plan/run, render, filesystem `BaselineStore` |
| `Varar.TestAdapter` | the `dotnet test` binding — [ADR 0009](0009-dotnet-test-adapter-integration.md) |

(This mirrors the rename's `@varar/varar` + `@varar/core` and `dev.varar:varar` +
`dev.varar:core` shape: base-named facade, leaf-named siblings.)

Two author-API forks are settled by matching the **static-language** ports
(Java/Kotlin/Rust), not the dynamic ones (Python/Ruby):

- **Registration:** an **injected Registrar** (`DefineSteps(IRegistrar)` /
  `Register(Registry) -> Registry`), not a module-scope accumulator — .NET has
  no clean, per-run import-for-side-effect story (`[ModuleInitializer]` runs
  once per assembly load, not once per test run).
- **State evolution:** **full replacement** (a `stimulus` returns the whole next
  state as an immutable `Value`), not TS/Python shallow partial-merge — so no
  runtime `deep_freeze` is needed; immutability is enforced by the type system
  (records + `ImmutableArray`/`ImmutableDictionary`), as in Rust.
- **Step source location:** captured at the call site via C#'s native
  `[CallerFilePath]` / `[CallerLineNumber]` (the direct analog of Rust's
  `#[track_caller]`), so authors never pass `file`/`line`; the fixture path's
  stem (`numerals.steps.cs` → `numerals.steps`) is the canonical cross-language
  `stepFile`.

Target the **current .NET LTS** (`net10.0` as of 2026-07), pinned in
`global.json`; libraries enable nullable reference types and
`TreatWarningsAsErrors`.

## Consequences

- The three deferred golden gates (`registry`/`plan`/`trace`) require per-bundle
  `*.steps.cs` fixtures and live in the `Varar` facade's conformance harness,
  mirroring Java's `varar` module and Rust's `varar` crate.
- **cucumber-expressions parity (de-risked):** unlike Rust (community `0.5`
  crate, hand-written regexp generation, `{float}` omitted), .NET has the
  **official `Cucumber.CucumberExpressions` package at `20.0.0`** (published by
  the Cucumber org, targeting .NET Standard 2.0) — exact version parity with
  every other port. The matcher ports only Varar's own hit-resolution / ambiguity
  / offset-shifting *around* the library; the grammar and regexp generation come
  from the package. (Confirm the package's `Argument`/`Group` offset API returns
  UTF-16 `char` indices at implementation start — expected, since .NET `Regex`
  match indices are `char` offsets.)
- **F# is a later facade over the C# engine** (its own future ADR + design),
  scoped to **registry-only conformance** — its `*.steps.fs` fixtures prove
  registration; parse/plan/trace stay proven by C#'s already-green corpus,
  exactly as Kotlin sits on Java. The framework-neutral `Varar.TestAdapter`
  (ADR 0009) is language-agnostic (it runs the compiled test assembly and globs
  the configured step files), so F# is expected to **reuse it directly** —
  needing only a facade, `.steps.fs` fixtures, a tree-sitter dialect, and a
  `languages.json` entry (even lighter than Kotlin, which needed its own
  `kotest` adapter).
- The `dotnet test` integration mechanism is its own decision:
  [ADR 0009](0009-dotnet-test-adapter-integration.md).
- Repo/release integration adds a `dotnet/` workspace, a `make dotnet` gate, a
  NuGet publish target (`release/targets/67-nuget.sh`), the `dotnet` consumer
  commit-scope + a NuGet changelog section, a `csharp` `languages.json` entry, a
  C# tree-sitter dialect, and the website/editor surfaces — tracked in the plans,
  not this ADR.

## References

- [ADR 0001 — second language (Python)](0001-second-language-python.md) — the
  per-language seam table this ADR fills in for .NET.
- [ADR 0006 — Rust port](0006-rust-port.md) — closest full-pipeline, no-runtime-
  sharing precedent.
- [Varar rename plan](../RENAME-VARAR.md) — the naming scheme these coordinates
  follow.
- Kotlin-over-Java facade — the pattern F# will follow over C#
  (`doc/superpowers/specs/2026-07-01-kotlin-facade-design.md`).
- Design specs: `doc/superpowers/specs/2026-07-19-dotnet-core-port-design.md`,
  `doc/superpowers/specs/2026-07-19-dotnet-runner-adapter-design.md`.
- `Cucumber.CucumberExpressions` on NuGet —
  https://www.nuget.org/packages/Cucumber.CucumberExpressions
