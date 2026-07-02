# Changelog

All notable changes are documented here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are
lockstep across every port: one `vX.Y.Z` git tag releases npm, PyPI,
Maven Central, the VS Code Marketplace, and Open VSX together.

`release/release.sh` refuses to release a version that has no `## [x.y.z]`
section below. Before releasing, rename `## [Unreleased]` to `## [x.y.z]`
(and start a fresh `## [Unreleased]` on top).

## [0.1.0]

### Added

- First public release of var: Markdown-native BDD for TypeScript (npm),
  Python (PyPI), and Java/Kotlin (Maven Central), plus the Vár VS Code
  extension (Marketplace and Open VSX).
