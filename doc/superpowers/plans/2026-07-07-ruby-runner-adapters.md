# Ruby runner + RSpec/Minitest adapters — task plan (sub-project 2)

**REQUIRED SUB-SKILL:** superpowers:executing-plans or
superpowers:subagent-driven-development. Load the
[`adding-a-language-port`](../../../.claude/skills/adding-a-language-port/SKILL.md)
skill.

Design: [`2026-07-07-ruby-rspec-minitest-design.md`](../specs/2026-07-07-ruby-rspec-minitest-design.md).
Prereq: sub-project 1 conformance-green (all four artifacts × 15 bundles + config
corpus + drift unit tests).

## Goal

`oselvar-var-runner` (imperative shell incl. filesystem `BaselineStore` + drift
reconciliation) and two adapters (`oselvar-var-rspec`, `oselvar-var-minitest`),
each giving one selectable test per example with `.md`-anchored failures and a
drift gate, validated by dogfooding the conformance bundles against `trace.json`.

## Global constraints

- Adapters contain **no pipeline logic** — delegate to `var-runner`/`var-core`.
- Glob matching is the hand-rolled `glob_to_regex` (not `Dir.glob`), matching the
  other runners byte-for-byte on `**`/`../`.
- Drift is gated in every adapter; never silently accept it (ADR 0002).
- Each task ends green + `rubocop` clean + one commit.

## File structure (target)

```
ruby/packages/
  var-runner/{oselvar-var-runner.gemspec, lib/oselvar/var/runner/{discovery,steps,run,render,baseline_store}.rb, spec/**}
  var-rspec/{oselvar-var-rspec.gemspec, lib/oselvar/var/rspec.rb, spec/**}
  var-minitest/{oselvar-var-minitest.gemspec, lib/oselvar/var/minitest.rb, spec/**}
```

---

## MILESTONE 1 — `var-runner`

- [ ] **Task 1. `discovery.rb`.** Port TS/Python `discovery` — `find_specs`,
  `match_spec`, `glob_to_regex` (`**`/`*`/`?`/`../`). Translate its tests.
- [ ] **Task 2. `steps.rb` + `run.rb`.** `load_steps` (reset accumulator,
  `require` step files, build registry + context factory), `plan_spec`,
  `examples_with_runs`, `RecordingReporter`.
- [ ] **Task 3. `render.rb`.** `render_failure(error, source, path)` dispatching
  on the core diff/failure types; span-anchored text. Translate against the TS
  `render` behaviour.
- [ ] **Task 4. `baseline_store.rb`.** Filesystem `BaselineStore` (read/write
  `var.lock.json`) + `reconcile_drift` wiring. Translate against
  `baseline-store.test.ts` / `var_runner` baseline_store.
  *Commit:* `feat(ruby/var-runner): discover specs, load steps, plan, render failures, and reconcile drift`.

## MILESTONE 2 — `var-rspec`

- [ ] **Task 5. Generator + collection.** `Oselvar::Var::RSpec.generate`: read
  config, load steps, find+plan specs; emit one `describe` per file + one `it`
  per example with `.md`-line anchoring; run via `examples_with_runs`. Unit test
  collection (one `it` per example, correct location).
- [ ] **Task 6. Failure + diagnostics + drift gate.** Raise
  `ExpectationNotMetError` with `render_failure` on diffs; surface
  `ambiguous-match`/`error-fence-without-step`/`drift` as failing markers; gate on
  drift via the runner. Unit test failures + a drift test with a `var.lock.json`
  fixture.
- [ ] **Task 7. Dogfood.** Run `conformance/bundles/*` through the adapter;
  assert outcomes/messages match the `trace.json` goldens.
  *Commit:* `feat(ruby/var-rspec): run Markdown specs as RSpec examples`.

## MILESTONE 3 — `var-minitest`

- [ ] **Task 8. `generate_tests` + collection + failure.** Inject one
  `Minitest::Test` subclass per spec, one `test_*` per example; var diff →
  `Minitest::Assertion`, else error. Unit test collection + failures.
- [ ] **Task 9. Drift gate + dogfood.** Gate on drift via the runner (drift test
  with `var.lock.json` fixture); dogfood the bundles against `trace.json`.
  *Commit:* `feat(ruby/var-minitest): run Markdown specs as Minitest tests`.

## MILESTONE 4 — repo integration

- [ ] **Task 10. Example projects.** `examples/ruby-rspec` + `examples/ruby-minitest`
  standalone consumer projects (own Gemfile depending on the gems, own
  `var.config.json`, subset `.md` specs as symlinks to `typescript-vitest`
  originals, `steps/*.steps.rb`, README). Implement `hello-var`, `deep-thought`,
  `tables-and-docstrings`, `yahtzee`, `roman-numerals`.
- [ ] **Task 11. Makefile + CI.** Add `make ruby` (`cd ruby && bundle install &&
  bundle exec rake` + the two example projects) threaded into `check:`; update
  the Makefile header. Add `.github/workflows/ruby.yml` (trigger on `ruby/**`,
  `conformance/**`, `examples/**`; `ruby/setup-ruby`; same gate; example
  projects).
- [ ] **Task 12. Release wiring.** `release/targets/70-rubygems.sh` (publish the
  six gems), add RubyGems to the release channels, add `ruby-rspec`/`ruby-minitest`
  rows to `examples/README.md`.
  *Commit:* `chore(ruby): wire ruby port into make check, CI, examples, and release`.

## Self-review

- Adapters have no pipeline logic (grep).
- `make ruby` green, then `make check` (all five ports) green.
- Both adapters' dogfood outcomes agree with `trace.json`; both drift gates fire
  and re-record byte-stably.
- Example projects run standalone (`bundle exec rspec` / `bundle exec rake test`).
