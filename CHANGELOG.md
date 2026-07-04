# Changelog

All notable changes are documented here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are
lockstep across every port: one `vX.Y.Z` git tag releases npm, PyPI,
Maven Central, the VS Code Marketplace, and Open VSX together.

This file is generated from conventional commit messages by
[git-cliff](https://git-cliff.org) (`make changelog`) — do not edit it by
hand. The `[Unreleased]` section is refreshed by CI on every push to `main`.

## [0.3.0] - 2026-07-04

### TypeScript (npm)

- Added: **var-vitest:** Cell and doc string mismatches render vitest's expected/received diff in the terminal and VS Code peek view
- Added: Cell mismatches diff the authored line against the actual values and anchor editors at the first failing cell
- Added: **var-vitest:** Cell mismatch diffs show only the differing values, not the whole step text

### Specification (all ports)

- ⚠️ **Breaking:** Sensors return a single parameter, table or doc string bare — positional arrays only for two or more values
  sensors no longer wrap a single comparison value in an
array/list/tuple. When a step has exactly one comparison slot (one
expression parameter, or just a trailing table/doc string), return the
value itself: `return total`, not `return [total]`. Keep the positional
array only when there are two or more slots. A sensor with no slots must
return nothing — returning a value now raises ReturnShapeError (throw to
fail instead). Single-slot returns are never read as positional arrays,
so a custom parameter type transforming to an array is deep-compared
as-is.
- ⚠️ **Breaking:** Context and action merge into a single stimulus step kind — defineState returns { stimulus, sensor }
  the context and action step kinds are gone; register
both kinds of step with stimulus instead (TS/Kotlin `stimulus(...)`,
Python `@stimulus(...)`, Java `s.stimulus(...)`). Behaviour is
unchanged — a stimulus evolves state exactly as context/action did, and
sensors are untouched. The arrange/act (given/when) concepts remain
useful narration in your Markdown, but they share one mechanism.
Snippet generation now infers stimulus for any step with steps after it
and sensor for the last one, and generated snippets offer the other
role as a single commented alternative.
- Added: Conformance pins each failure's anchor span, so a mismatch points at its first failing cell in every port

## [0.2.0] - 2026-07-03

### TypeScript (npm)

- ⚠️ **Breaking:** **var-lsp:** Var/stepGlobs reports each step glob's language
  the `var/stepGlobs` custom request now returns
`ReadonlyArray<StepGlob>` (`{ glob, language? }`) instead of
`ReadonlyArray<string>`; clients should filter globs by the `language`
field rather than classifying file paths themselves.
- ⚠️ **Breaking:** Packages no longer re-export other packages' APIs
  import VarConfig, loadVarConfig (was readVarConfig) and
findFiles (was findSpecs) from @oselvar/var-config; VarDoc and
resolveScannerPlugins from @oselvar/var-core; StepDef from
@oselvar/var-language. @oselvar/var-vitest/runtime's collectVarExamples
now takes scanner-plugin names (strings) instead of resolved plugin
instances.
- Fixed: **var-vitest:** Generated modules import runtime helpers from @oselvar/var-vitest/runtime
- Fixed: **var-cli:** Installing @oselvar/var-cli no longer pulls in @oselvar/var

### Python (PyPI)

- ⚠️ **Breaking:** **var-runner:** Var_runner no longer re-exports var_config's API
  import VarConfig and read_var_config from var_config
instead of var_runner.

## [0.1.0]

### Added

- First public release of var: Markdown-native BDD for TypeScript (npm), Python (PyPI), and Java/Kotlin (Maven Central), plus the Vár VS Code extension (Marketplace and Open VSX).

