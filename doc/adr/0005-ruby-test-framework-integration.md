# ADR 0005 — Ruby RSpec + Minitest integration

- **Status:** Accepted
- **Date:** 2026-07-07
- **Deciders:** Aslak Hellesøy
- **Tags:** ruby, rspec, minitest, test-runner-adapter, cross-language

## Context

Ruby is a full language port ([ADR 0004](0004-ruby-port.md)). Like every other
port, its test-framework adapters must give **one independently
selectable/reportable test per Markdown example**, with failures rendered
anchored to the `.md` source span — the contract `var-vitest`, `var-pytest`,
`var-unittest`, `var-junit`, and `var-kotest` all satisfy
([ADR 0003](0003-java-junit-integration.md) is the JVM precedent). ADR 0004
chose two Ruby adapters: **RSpec** (dominant, the pytest analogue) and
**Minitest** (ships with Ruby, the `unittest` analogue). This ADR records the
integration mechanism each uses.

Unlike JUnit (which exposes a discovery SPI) or pytest (which exposes a
`pytest_collect_file` hook for arbitrary files), **neither RSpec nor Minitest
collects non-Ruby files**. Both discover tests by loading Ruby files and
observing the example/`Test`-subclass structure those files declare at load
time. So the mechanism for both is necessarily "a Ruby entry-point file that,
when loaded, reads `var.config.json`, plans every matched spec through
`var-runner`, and *generates* one framework-native test per example" — the same
generate-at-load-time shape `var-unittest` and `var-kotest` already use, rather
than pytest's file-collection shape.

## Decision

### RSpec — a generator that emits one `it` per example

`oselvar-var-rspec` exposes a generator (invoked from a tiny
`spec/var_spec.rb`: `Oselvar::Var::RSpec.generate`). At load time it:

- reads `var.config.json` via `var-config`, loads the step files via
  `var-runner`, and finds + plans every matching `.md` spec;
- defines **one `RSpec.describe` per spec file**, and within it **one `it` per
  planned example** (header-bound table rows are separate examples), preserving
  the example's scope-stack headings as nested `describe`/`context`;
- anchors each `it` to its `.md` source line via example metadata
  (`location`/`absolute_file_path` set to `"<spec>.md:<startLine>"`) so IDE/CLI
  "run this example" and reporting point at the Markdown, not the generator
  frame — the RSpec equivalent of `var-junit`'s `UniqueId`/`TestSource` care;
- runs the example through the core executor inside the `it` block; on a `var`
  diff/failure it raises an `RSpec::Expectations::ExpectationNotMetError` (a
  *failure*, not an error) carrying the shared span-anchored `render_failure`
  text; a genuine unexpected exception propagates as an error.

Plan-stage diagnostics (`ambiguous-match`, `error-fence-without-step`,
`drift`) surface as failing marker examples so they are reportable, not silent.

### Minitest — `generate_tests` injecting one `Test` subclass per spec

`oselvar-var-minitest` exposes `Oselvar::Var::Minitest.generate_tests(namespace)`
(invoked from a `test/var_test.rb`). It is a near-direct port of `var-unittest`:
at load time it reads config, loads steps, and for each matched spec injects a
**`Minitest::Test` subclass** into the caller's namespace with **one `test_*`
method per example** (identifier-safe method names; the real example name in the
failure message and, where supported, the reported description). A `var`
diff/failure is re-raised as a `Minitest::Assertion` (a failure); any other
exception propagates as an error. Each method is independently selectable via
Minitest's `-n`/`--name` filter.

### Shared across both

Both adapters are thin: discovery, planning, drift reconciliation, and failure
rendering all live in `var-runner`/`var-core`. Neither contains pipeline logic.
Both gate on drift — reconciling each spec against `var.lock.json` through the
runner's filesystem `BaselineStore`, surfacing a `drift` diagnostic that fails
the suite, writing the baseline on a clean run, and honouring an
`--update`/acknowledgment path ([ADR 0002](0002-drift-detection-and-acknowledgment.md)).

## Consequences

### Positive

- Individual examples are first-class, independently selectable/reportable in
  both frameworks — parity with every other adapter.
- Adding the gem + a two-line entry-point file is the whole integration; no
  bespoke test loader or RSpec formatter to install.
- Both adapters reuse the same runner/core, so they cannot disagree with the
  conformance-proven pipeline; a shared dogfood test asserts their outcomes
  against the `trace.json` goldens.

### Negative / risks

- **RSpec `.md`-anchoring is the subtle part** (mirrors ADR 0003's
  `UniqueId`/`TestSource` risk): RSpec derives an example's re-run location from
  the `it` block's Ruby location by default. Overriding it to point at the `.md`
  line must survive `rspec path:line`, `--example`, and reporting — verify with a
  real sample project, don't assume.
- Generate-at-load-time means examples appear only once their entry-point file
  is loaded (both frameworks). This is inherent to Ruby's no-arbitrary-file-
  collection model and matches `var-unittest`/`var-kotest`.
- Per-example fixture-lifecycle bridging (RSpec `let`/hooks) is **out of scope
  for v1** — handlers receive plain context state, as `var-unittest` does.
  Revisit if demand appears.

## Alternatives considered

- **A custom RSpec formatter.** Rejected — formatters observe/report runs, they
  do not create examples; it cannot deliver one selectable test per example.
- **A custom RSpec file loader treating `.md` as spec files** (via `--pattern`).
  Rejected — RSpec's loader expects Ruby; bending it is heavier and less robust
  than generating `describe`/`it` from a normal Ruby entry-point file.
- **Minitest via a custom runner/plugin instead of generated subclasses.**
  Rejected — Minitest's `Test`-subclass model is exactly the generate-at-load
  shape `var-unittest` proved; a plugin would be more code for no gain.

## References

- [ADR 0003 — Java JUnit integration](0003-java-junit-integration.md) — the
  adapter-contract precedent (one selectable test per example, span-anchored
  failures) this ADR fills in for Ruby.
- [ADR 0002 — drift detection & acknowledgment](0002-drift-detection-and-acknowledgment.md).
- Reference adapters: `python/packages/var-pytest`, `python/packages/var-unittest`,
  `java/var-kotest`.
- `doc/superpowers/specs/2026-07-07-ruby-rspec-minitest-design.md` — the concrete
  `var-runner` + adapter design this decision feeds.
