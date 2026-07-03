# Changelog

All notable changes are documented here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are
lockstep across every port: one `vX.Y.Z` git tag releases npm, PyPI,
Maven Central, the VS Code Marketplace, and Open VSX together.

This file is generated from conventional commit messages by
[git-cliff](https://git-cliff.org) (`make changelog`) — do not edit it by
hand. The `[Unreleased]` section is refreshed by CI on every push to `main`.

## [Unreleased]

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

