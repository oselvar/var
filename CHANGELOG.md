# Changelog

All notable changes are documented here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are
lockstep across every port: one `vX.Y.Z` git tag releases npm, PyPI,
Maven Central, the VS Code Marketplace, and Open VSX together.

This file is generated from conventional commit messages by
[git-cliff](https://git-cliff.org) — do not edit it by hand. It is written at
release time by `make prepare`; preview the next release with `make changelog`.

## [0.5.1] - 2026-07-21

### TypeScript (npm)

- ⚠️ **Breaking:** Publish the TypeScript port under the @varar npm scope
  npm packages are renamed from the @oselvar scope to @varar.
Update imports: `@oselvar/var` -> `@varar/varar`, `@oselvar/var-vitest` ->
`@varar/vitest`, etc.

### Python (PyPI)

- ⚠️ **Breaking:** Publish the Python port under the varar distribution names
  PyPI distributions are renamed. Install `varar` /
`pytest-varar` instead of `oselvar-var` / `pytest-var`, and import `varar*`
instead of `var*`.

### Java & Kotlin (Maven Central)

- ⚠️ **Breaking:** Publish the JVM port under the dev.varar Maven coordinates
  Maven coordinates change from com.oselvar:var* to
- ⚠️ **Breaking:** Steps.defineState is now Steps.state
  Java's `Steps.defineState(factory)` is now `Steps.state(factory)`
and .NET's `Steps.DefineState(factory)` is now `Steps.State(factory)`. Rename the
call in each step file; there is no other change to the API.
- Fixed: **var-kotlin:** Backtick-escape the `var` keyword in a Kotlin import so ktfmt passes

### Ruby (RubyGems)

- ⚠️ **Breaking:** Publish the Ruby port under the varar gem names
  RubyGems names change from oselvar-var* to varar*; require
paths from 'oselvar/var...' to 'varar...'; and the module namespace from
- ⚠️ **Breaking:** The state factory must be a proc, called fresh per example
  `steps` no longer accepts a Hash or keyword arguments as the
initial state — pass a Proc/lambda instead, e.g. `steps(count: 0)` becomes
`steps(-> { { count: 0 } })`. Omitting the factory entirely, for stateless step
files, is unchanged. Passing a Hash now raises ArgumentError with the rewrite.
- Fixed: Update minitest gemspec dependency to ~> 6.0 and regenerate lockfile
- Fixed: Update minitest to ~> 6.0 in examples/ruby-minitest Gemfile

### Go (Go modules)

- Added: Run your Markdown specs as Go tests with `go get github.com/varar-dev/varar/go`
- Fixed: Keep conformance fixtures out of the published module

### VS Code extension (Marketplace & Open VSX)

- Fixed: Align @types/vscode with the supported VS Code floor

### Specification (all ports)

- ⚠️ **Breaking:** Rename the config/lock files, CLI command, and scaffold to varar
  rename var.config.json -> varar.config.json and
var.lock.json -> varar.lock.json in your project, point "$schema" at
varar.config.schema.json, and invoke the CLI as `varar` instead of `var`.
- ⚠️ **Breaking:** A stimulus returns the complete next state, replacing it
  A stimulus must return the complete next state, not a partial
one. In TypeScript, Python and Ruby a return that omits a field now drops that
field instead of preserving it — spread the current state to keep it, e.g.
`(state) => ({ ...state, count: 1 })`. Returning nothing still leaves state
unchanged, and is now a no-op in Java, Rust and .NET rather than wiping state.
- Added: Step handlers accept up to five captures in every port
- Fixed: Every port words and quotes failure messages identically

## [0.4.2] - 2026-07-08

### Java & Kotlin (Maven Central)

- Fixed: **var-config:** Reject leading-dot JSON numbers and position invalid \u escape errors

## [0.4.1] - 2026-07-08

### TypeScript (npm)

- Added: **var-cli:** Scaffold the Deep Thought example instead of a Given/When/Then greeting

## [0.4.0] - 2026-07-07

### TypeScript (npm)

- Added: **var-core:** Detect spec drift — a paragraph that was an example and now matches zero steps
- Added: **var-core:** Drift re-identifies examples by text similarity, so moving and rewording never false-alarm
- Added: **var-core:** Report drift as a Diagnostic and add a BaselineStore port
- Added: **var-core:** ReconcileDrift orchestrates baseline read → detect → write through the BaselineStore port
- Added: **var-cli:** Var run detects spec drift and gates on it
- Added: **var-vitest:** Read-only drift gate — a spec whose example stopped matching fails the suite
- Fixed: **var:** Resolve a step's source file from bundled, minified stack traces

### Python (PyPI)

- Added: **var-core:** Detect spec drift with a byte-identical var.lock.json baseline
- Added: **var-pytest:** Pytest and unittest gate on spec drift, writing var.lock.json
- Added: **var-runner:** Scaffold a starter project with `var init`

### Java & Kotlin (Maven Central)

- Added: **var-core:** Detect spec drift with a byte-identical var.lock.json baseline
- Added: **var-junit:** The JUnit engine gates on spec drift
- Added: **var-kotest:** Kotest VarSpec gates on spec drift

### Ruby (RubyGems)

- ⚠️ **Breaking:** **var:** Block-based step DSL
  step files no longer destructure `steps` into
`param, stimulus, sensor` and call them with `.call`/`.()`. Move the
registrations into a `steps(...) do … end` block and pass the initial state as
an argument instead of a factory block.
- Added: **var-core:** Scaffold the ruby workspace and port the UTF-16 span layer
- Added: **var-core:** Parse Markdown specs to a var-doc AST with UTF-16 spans
- Added: **var-core:** Register step definitions via cucumber-expressions
- Added: **var-core:** Match steps and build execution plans
- Added: **var-core:** Execute plans and compare returns against the document
- Added: **var-core:** Detect spec drift with a byte-identical var.lock.json baseline
- Added: **var-config:** Read var.config.json
- Added: **var-rspec:** Run Markdown specs as RSpec examples
- Added: **var-runner:** Scaffold a starter project with `var init`

### VS Code extension (Marketplace & Open VSX)

- Added: Drift shows as an editor warning with an "Accept as prose" quick fix
- Added: Recognize Ruby step definitions in the editor
- Fixed: Kotlin parameter types declared with raw-string regexes are now discovered

### Specification (all ports)

- ⚠️ **Breaking:** Custom parameter types pair parse with a format function — mismatches render in the document's notation
  declare a custom parameter type's transform function as
parse (was transformer) in defineState (TypeScript), define_state (Python),
Registrar.defineParameterType (Java) and parameterType (Kotlin).
- ⚠️ **Breaking:** Step matching runs against raw inline text — markup is never stripped
  expressions that relied on emphasis stripping must move
the markers into a parameter type (e.g. regexp /\*[^*]+\*/ with parse
raw.slice(1, -1)); the var-doc artifact's inlineMap field is now
segmentMap.
- ⚠️ **Breaking:** Unify step authoring on steps() → param, stimulus, sensor
  the step-authoring API is renamed and restructured in every
port; `parse` is now a varargs function over the capture groups.

- TypeScript: `const { stimulus, sensor } = defineState(factory, paramTypes)`
  becomes `const { stimulus, sensor } = steps(factory).param(name, regexp, parse?, format?)`.
  Chain `.param()` before destructuring to keep custom-param handler-arg
  inference.
- Python: `stimulus, sensor = define_state(factory, param_types=...)` becomes
  `param, stimulus, sensor = steps(factory)`, then
  `param(name, regexp, parse=None, format=None)`.
- Java: `registrar.defineState(factory)` becomes `registrar.steps(factory)`,
  and `registrar.defineParameterType(...)` becomes `s.param(name, Pattern, parse?, format?)`
  on the returned binder (`parse` is a `String...` varargs SAM; a
  two-argument `param(name, Pattern)` gives identity parse).
- Kotlin: top-level `defineState { ... }` becomes `steps { ... }`, and
  `parameterType(...)` becomes `param(...)`.
- Added: The state factory argument to defineState/define_state is now optional — step files with pure steps can omit it

## [0.3.1] - 2026-07-06

### Python (PyPI)

- Added: **var-unittest:** Run Markdown specs as unittest tests — generate_tests(globals()) in one test module is the entire integration
- Fixed: **var-runner:** Symlinked specs match the docs globs by their apparent path

### Java & Kotlin (Maven Central)

- Fixed: **var-junit:** Symlinked specs are discovered, and docs globs resolve against var.config.root

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

- First public release of var: Markdown-native BDD for TypeScript (npm), Python (PyPI), and Java/Kotlin (Maven Central), plus the Varar VS Code extension (Marketplace and Open VSX).

