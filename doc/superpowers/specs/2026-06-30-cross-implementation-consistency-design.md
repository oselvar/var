# Cross-implementation consistency — canonical structure & naming

Date: 2026-06-30
Status: design, pending implementation

`var` now has two passing implementations — TypeScript (the reference) and Python.
They pass the **same** conformance suite but diverge in package seams, what lives in
each package, and some names/parameter orders. The next implementor (Java, C#, Rust,
Ruby, …) must not have to ask "which style do I follow?". This document defines the
**canonical structure and naming** that every implementation conforms to, and decomposes
the work to get the two existing implementations there.

**Principle.** TypeScript stays the reference. Idiomatic per-language differences are
expected and kept (camelCase ↔ snake_case; `var.config.ts` ↔ `[tool.var]` in
`pyproject.toml`; ESM imports ↔ `importlib`). Everything else — package names and seams,
module names, function/parameter/variable names, and *what lives where* — is the same in
every implementation. When a port discovers a genuinely better factoring, it is adopted
everywhere (this is how `var-runner` below enters TypeScript).

## What each implementation got right (and wrong)

- **TS core seam (keep).** TS splits the core into `var-core` (pure engine) + `var`
  (author facade: the module-scope step accumulator + `defineState`, plus a `./registry`
  adapter subpath). Authors import the *thin* `var`; adapters use `var-core` + the
  registry glue. Python merged everything into one `var` package, so the author's package
  *is* the whole engine. **TS is the better role model → Python splits.**
- **Python `var-runner` (adopt everywhere).** Python factored the imperative shell shared
  by every runner — config, spec discovery, step loading, run orchestration, failure
  rendering — into a standalone `var-runner` package reused by `var-pytest` (and the
  future `var-unittest`). TS has **no** shared runner: `var-vitest/runtime.ts` and
  `var-cli/run.ts` each re-implement the same discover→load-steps→parse→plan→execute
  sequence. **Python is the better role model → TS gains `var-runner`.**
- **Config/discovery placement.** TS exposes `loadVarConfig`/`findFiles` from
  `var-core/node` — file I/O reachable from "core". That is shell, not core. **It moves to
  `var-runner`** (keeping `var-core` free of filesystem access on every platform).

## Canonical package map (every implementation)

| Package | Layer | Owns | Depends on |
|---|---|---|---|
| `var-core` | pure functional core | parse → plan → execute, matcher, diffs, conformance projections, registry CRUD, hashing, span/AST. No I/O, no globals, no time. | (cucumber-expressions only) |
| `var` | author facade | the module-scope step accumulator + `defineState`, and the adapter glue `buildRegistry`/`contextFactory`/`_resetBuilder`. | `var-core` |
| `var-runner` | shared imperative shell | config reading, spec discovery, step-file loading, run orchestration (parse→plan→collect), failure rendering. The only place with filesystem + module-loading I/O common to all runners. | `var-core`, `var` |
| `var-<adapter>` | runner adapter | bind `var-runner` to a specific runner + its reporting/lifecycle. | `var-runner` |

Adapters: **TS** `var-vitest`, `var-cli`; **Python** `var-pytest`, `var-unittest`.
Authoring/editor packages (`var-language`, `var-lsp`, `var-vscode`, `website`) are a
separate, TS-only concern and out of scope here.

Distribution naming stays per-ecosystem but parallel: TS `@oselvar/var-core`,
`@oselvar/var`, `@oselvar/var-runner`, `@oselvar/var-vitest`, … ; Python `oselvar-var-core`,
`oselvar-var`, `oselvar-var-runner`, `pytest-var`, `oselvar-var-unittest`.

## Canonical seam: `var-core` ↔ `var`

`var-core` (pure, no module-scope mutable state):
`createRegistry` · `addStep` · `defineParameterType` · `parse(path, source, plugins)` ·
`plan(varDoc, registry)` · `executePlan(plan, ports)` · `collectExamples(plan, ports)` ·
matcher (`findHits`/`resolveHits`) · the diffs · the conformance projections
(`toVarDocArtifact`/`toRegistryArtifact`/`toPlanArtifact`/`toFailureArtifact`/
`runConformance`/`canonicalStringify`) · `toFailure` · `hashSource`.

`var` (author facade, the only place with module-scope mutable accumulator):
`defineState(factory, paramTypes)` → `{ context, action, sensor }` ; and the
adapter-only glue `buildRegistry()` · `contextFactory()` · `_resetBuilder()`.

This means **Python splits its current single `var` into `var-core` + `var`**, moving
`define_state.py` (the accumulator) into the new `var` facade and everything else into
`var-core`. The author API is unchanged (`from var import define_state` still works), so
no step-definition fixtures change.

## Ports & injection — what an "adapter" actually is

`var-core` is purely hexagonal: it receives only two kinds of things, and never touches
the filesystem, time, or globals itself.

1. **Data** — plain values: `source` bytes, a built `registry`, config values.
2. **Port callbacks** — the functions/objects the core *calls back*: the `sink` (how a
   passing/failing example becomes a runner test), the `reporter` (diagnostics),
   `createContext` (fresh per-example state), and — in pytest — the fixture resolver.

This yields a sharp definition:

- **An "adapter" is exactly the port-callback implementations for one runner** — nothing
  more. It is irreducible (no generic form of "tell pytest a test exists / report a result
  / supply a fixture" exists) but **thin**. `var-pytest` looks larger only because pytest's
  own integration surface (collection hooks, fixture machinery) lives there.
- **Inject only data → no adapter.** A caller that hands the core `source` + a `registry`
  and a trivial default sink gets results back as plain data. This is exactly what the
  **browser/website** does: no filesystem, no runner — it injects the editor's source
  directly into `parse → plan → execute` and reads results out.

- **The filesystem is NOT a core port.** It is how the *shell* gathers the data to inject.
  That is the entire reason `var-runner` exists: it is the **file-based** shell (discover
  specs, load step files, read config) shared by file-based runners. A non-fs platform
  (the browser) simply **does not use `var-runner`** — it injects directly. So there is no
  "fs port/adapter" in the core. An injectable `FileSystem` port would only be added
  *inside* `var-runner` if a second fs implementation appeared (in-memory/virtual) —
  **YAGNI until then; fs stays concrete in `var-runner`.**

## Canonical `var-runner` API (every implementation)

The shared shell, named identically (modulo case). Python already has this shape; TS
adopts it. Signatures shown in TS spelling; Python uses snake_case equivalents.

- `readVarConfig(...) -> VarConfig` — read the per-language config (`var.config.ts` /
  `[tool.var]`). `VarConfig` fields: `varsInclude`, `varsExclude`, `steps`,
  `scannerPlugins`.
- `findSpecs(include, exclude, root) -> Path[]` · `matchSpec(path, include, exclude, root) -> bool`.
- `loadSteps(stepGlobs, root) -> LoadedSteps { registry, createContext }`.
- `planSpec(path, source, registry) -> ExecutionPlan` — **`(path, source)` order**.
- `examplesWithRuns(plan, createContext, reporter) -> { example, run }[]`.
- `RecordingReporter` — accumulates diagnostics.
- `renderFailure(error, source, path) -> string`.

## Canonical naming & parameter conventions (fixes both implementations)

These are the concrete divergences to erase (the design exercises the granted naming
freedom; notable picks flagged for review):

1. **Parameter order is `(path, source)` everywhere.** Today both have `parse(path,
   source)` but the runner helpers flip it (`runVarSource(source, path, ports)` in TS;
   `plan_spec(source, path, registry)` in Python). Both move to `(path, source)`.
2. **A step handler's first parameter is `state`** (the immutable evolving context).
   Align TS's low-level `StepHandler` type, whose param is `ctx`, to `state` to match the
   author-facing API and Python.
3. **`renderFailure(error, source, path)`** — Python's `render_failure(error, source,
   var_path)` renames `var_path` → `path`.
4. **`runConformance` returns a typed `BundleArtifacts`** in both. Python currently returns
   a plain `dict`; it returns the typed structure (a frozen dataclass) like TS. (Wire
   output via `canonicalStringify` is unchanged.)
5. **Conformance projection parameter names** match TS: `toPlanArtifact(plan)` (Python's
   `to_plan_artifact(execution_plan)` → `plan`, aliasing the `plan` function import where
   needed). `toFailureArtifact(error, line)`, `toVarDocArtifact(doc)`,
   `toRegistryArtifact(registry, parameterTypes)` — already aligned.
6. **`var-core` module file names match** (kebab ↔ snake of the same word): `cell-diff` /
   `cell_diff`, `doc-string-diff` / `doc_string_diff`, etc. — already largely aligned.

## Module-set parity (var-core)

The canonical `var-core` module set is the TS one. Python's `var-core` already mirrors the
**runtime** subset. The following TS `var-core` modules are **not yet** in Python and are
explicitly tracked, not silently dropped — each is ported when its feature arrives, under
its own sub-project, NOT in this alignment:
- `hash` → the **drift / run-result layer** (next sub-project after this one).
- `find-files`, `config`/`config-types` → these move to `var-runner` in TS (Python's
  `var-runner` already has discovery + config), so they are a `var-runner` concern, not a
  Python-`var-core` gap.
- `snippet`, `snippet-template`, `template`, `expression-segments`, `run-diagnostics`,
  `plugins/gherkin/*`, `deep-equal` → authoring/CLI/diagnostics features ported on demand.

This alignment does **not** port new features; it only relocates and renames existing code
so the two implementations have the same shape.

## The invariant

Every step keeps **both** implementations green against the **shared conformance goldens**
(byte-for-byte) and their own test suites. Renames/moves must not change any golden's wire
shape (camelCase keys, offsets, etc. are unchanged). The author API (`defineState` /
`define_state`) is unchanged, so no `*.steps.ts` / `*.steps.py` fixture changes.

## Decomposition into sub-projects

This is too large for one plan. It decomposes into independent, each-conformance-green
sub-projects (each its own spec → plan → implement cycle):

1. **Python core split** — `var` → `var-core` + `var`; move `define_state` into the facade;
   apply the Python-side naming/param-order fixes (`plan_spec` order, `render_failure`
   param, typed `run_conformance` return). Contained to the Python tree.
2. **TS `var-runner` extraction** — create `@oselvar/var-runner` holding the shared shell
   (config, discovery, load-steps, run orchestration, render); refactor `var-vitest` and
   `var-cli` to use it; move `loadVarConfig`/`findFiles` out of `var-core/node`; fix the
   `runVarSource` param order and `StepHandler` `ctx`→`state`. Larger blast radius (touches
   the reference that website/vscode/lsp/conformance depend on) — keep TS fully green.

The two are independent (different codebases) and can be done in either order. **Recommended
order: Python core split first** (smaller blast radius, a fast win that locks the canonical
seam), then the TS `var-runner` extraction. After both, a quick cross-check confirms the
inventories match.

## Known residual divergences (tracked for future convergence)

Both sub-projects landed (Python core split + TS var-runner extraction); the two
implementations now present one structure (`var-core` / `var` / `var-runner` /
adapters) with matching public names. These smaller seam divergences remain — none
blocks consistency, but record them so the reference fully converges later and the
next implementor (Java/C#) knows which side to follow:

- **Config/discovery physical ownership.** Python's `var-runner` *owns*
  `config`/`discovery`; TS's `var-runner` *re-exports* them — they physically stay
  in `var-core/node` because `var-lsp` imports them there. Accepted per decision
  (keep `var-lsp` off `var-runner`). Public API matches; physical home differs.
- **`matchSpec` / `match_spec`.** Python's `var-runner` exposes `match_spec`
  (per-file glob predicate, used by pytest's per-file collection hook); TS has no
  `matchSpec` (vitest does set-membership on discovered paths via an inline
  `isVarSpecId`). Add `matchSpec` to TS `var-runner` if/when a TS runner needs
  per-file matching.
- **`planSpec` arity.** TS `planSpec(path, source, registry, scannerPlugins?)`
  carries an optional `scannerPlugins`; Python `plan_spec(path, source, registry)`
  does not thread plugins here. Reconcile when Python grows scanner-plugin support.
- **`findSpecs` / `find_specs` parameter order.** TS `(cwd, include, exclude)` vs
  Python `(include, exclude, root)`. Pick one canonical order when next touched.
- **`renderFailure` wording.** Human-readable terminal text differs (and `var-cli`
  still uses its own `formatError` for output parity). Acceptable — it's not a
  name and not conformance-checked.

## References

- TS inventory & Python inventory (this session's analysis).
- [Python core port design](2026-06-30-python-core-port-design.md)
- [var-pytest plugin design](2026-06-30-var-pytest-plugin-design.md)
- [ADR 0001 — Python as the second language](../../adr/0001-second-language-python.md)
  (this design is a candidate for a follow-up ADR — "canonical cross-implementation
  structure"; note ADR 0002 is now
  [drift detection](../../adr/0002-drift-detection-and-acknowledgment.md)).
