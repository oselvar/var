# Ruby core port — task plan (sub-project 1)

**REQUIRED SUB-SKILL:** run this plan with superpowers:executing-plans or
superpowers:subagent-driven-development. Also load the
[`adding-a-language-port`](../../../.claude/skills/adding-a-language-port/SKILL.md)
skill.

Design: [`2026-07-07-ruby-core-port-design.md`](../specs/2026-07-07-ruby-core-port-design.md).

## Goal

A pure Ruby port of `@oselvar/var-core` + the `@oselvar/var` facade + the
`@oselvar/var-config` reader, proven by reproducing every conformance golden
(four artifacts × 15 bundles + the config corpus) byte-for-byte, plus the
drift feature proven by translating its TS unit tests.

## Architecture

`Oselvar::Var::Core` — pure functions over immutable (frozen) values, no I/O.
`Oselvar::Var` facade — module-scope accumulator + `steps()` (→ param, stimulus, sensor).
`Oselvar::Var::Config` — strict `var.config.json` reader.

## Tech stack

Ruby ≥ 3.1 (confirm 3.1 vs 3.2 in Task 1), Bundler `path:`-gem workspace under
`ruby/`, RSpec for the gems' own tests + the conformance harness, `rake` runner,
rubocop/standard lint, `cucumber-cucumber-expressions` 20.0.0.

## Global constraints

- **Offsets are UTF-16 code units** everywhere (spans, matcher, hash).
- **Pure core**: `var-core` never `require`s the facade/runner (grep gate).
- **Single runtime dep**, pinned: `cucumber-cucumber-expressions` 20.0.0.
- **Canonical JSON**: recursive key-sort → `JSON.pretty_generate` → `"\n"`;
  step-def files by stem. `var.lock.json` uses a *separate* insertion-order
  serializer.
- Immutable frozen value objects (`Data.define`/frozen `Struct`); updates return
  new values.
- Each task ends green (translated unit test + all conformance goldens
  implemented so far) + `rubocop` clean + one commit with the stated message.

## File structure (target)

```
ruby/
  Gemfile  Rakefile  .rubocop.yml
  packages/
    var-core/{oselvar-var-core.gemspec, lib/oselvar/var/core/*.rb, spec/**}
    var/{oselvar-var.gemspec, lib/oselvar/var{,/registry}.rb, lib/oselvar/var/internal.rb, spec/**}
    var-config/{oselvar-var-config.gemspec, lib/oselvar/var/config.rb, spec/**}
  scripts/lint_no_reexports.rb
```

Each conformance bundle gains a `*.steps.rb` (registry stage onward).

---

## MILESTONE 0 — workspace skeleton

- [ ] **Task 0.** Scaffold `ruby/` (Gemfile with `path:` sources, Rakefile,
  rubocop config, the six gemspecs with a smoke `require`), pin the Ruby
  version, and confirm `Data.define` vs frozen `Struct`. Wire `rake` to run
  RSpec + rubocop + the no-reexports gate.
  *Commit:* `chore(ruby): scaffold the ruby/ Bundler workspace and six gems`.

## MILESTONE 1 — parse → `var-doc.json`

Each task: **Port of** the named TS file, **Translate test** its `*.test.ts`
first (watch it fail), implement, run unit + `rubocop`, then the var-doc
conformance gate once the harness exists, commit.

- [ ] **Task 1. `span.rb` (+ UTF-16 primitives).** Port `span.ts`; add
  `utf16_len`, `to_utf16_offset`, `cp_index_for_utf16`, `utf16_slice`,
  `line_col`, `span_from_offsets`. Translate `span.test.ts`.
- [ ] **Task 2. `ast.rb`.** Port `ast.ts` value objects (`VarDoc`, `Example`,
  `Heading`, `Paragraph`, `ListItem`, `Blockquote`, `Table`, `Row`, `Fence`,
  `ThematicBreak`, `SegmentOffset`), all frozen.
- [ ] **Task 3. `inline.rb`.** Port `inline.ts` (block-text extraction +
  `SegmentOffset` map; **markup is never stripped** — raw inline text, per the
  breaking change on main). Translate its test.
- [ ] **Task 4. `table_cells.rb` + `sentences.rb`.** Port `table-cells.ts` and
  `sentences.ts` (code-span/quote no-split zones, abbreviations). Translate both
  tests.
- [ ] **Task 5. `scanner.rb`.** Port `scanner.ts` (line-based block recognizer,
  `ScannerPlugin` extension point). Translate `scanner.test.ts`.
- [ ] **Task 6. `structurer.rb` + `parse.rb`.** Port `structurer.ts`
  (blocks → examples, scope stacks, orphan attachments) and `parse.ts`.
- [ ] **Task 7. `canonical_json.rb`.** Recursive key-sort + `JSON.pretty_generate`
  + trailing `"\n"`; **prove byte-exact** against a small fixture (control chars,
  raw non-ASCII, nested). Hand-roll if stdlib drifts.
- [ ] **Task 8. var-doc conformance projection + harness.** Port
  `toVarDocArtifact`; write the RSpec harness iterating `conformance/bundles/*`;
  **GATE: every `var-doc.json` byte-for-byte**, especially `11-emoji-offsets`
  and `12-combining-marks`.
  *Commit:* `feat(ruby/var-core): parse Markdown specs to a var-doc AST with UTF-16 spans`.

## MILESTONE 2 — `registry.json`

- [ ] **Task 9. `step_role.rb`, `registry.rb`, facade `internal.rb` +
  `steps()`.** Port `step-role.ts`, `registry.ts`, and `@oselvar/var`
  `internal.ts` — the unified `steps() -> [param, stimulus, sensor]` (module-scope
  accumulator, per-file context factory, `build_registry`, `context_factory`,
  `custom_parameter_types`, `reset_builder`; `param` defines custom types with
  `parse`/`format`; wrap `cucumber-cucumber-expressions`). Translate the
  registry/facade tests.
- [ ] **Task 10. registry projection + `*.steps.rb` fixtures + gate.** Port
  `toRegistryArtifact` (names from the compiled AST, `regexp` as bare source);
  author a `*.steps.rb` per bundle registering the same expressions/handlers as
  each `*.steps.ts`; **GATE: every `registry.json` byte-for-byte**.
  *Commit:* `feat(ruby/var-core): register step definitions via cucumber-expressions`.

## MILESTONE 3 — `plan.json`

- [ ] **Task 11. `matcher.rb`.** Port `matcher.ts` (`findHits`/`resolveHits`,
  ambiguity ties, greedy non-overlap), **converting cucumber group offsets
  code-point → UTF-16**. Translate `matcher.test.ts`.
- [ ] **Task 12. `diagnostics.rb` + `plan.rb`.** Port `diagnostics.ts`
  (`ambiguous-match`, `error-fence-without-step`, `drift`) and `plan.ts`
  (paramSpans, table/doc-string attachment, header-bound rows, `error`-fence →
  expected-failure, `deriveExampleName`, `liftSpan`). Translate `plan.test.ts`.
- [ ] **Task 13. plan projection + gate.** Port `toPlanArtifact`; **GATE: every
  `plan.json` byte-for-byte**.
  *Commit:* `feat(ruby/var-core): match steps and build execution plans`.

## MILESTONE 4 — `trace.json`

- [ ] **Task 14. diff + failure modules.** Port `cell-diff.ts`,
  `doc-string-diff.ts`, `param-diff.ts`, `deep-equal.ts`, `failure.ts`,
  `result.ts`, `failure-anchor.ts`. Translate each test.
- [ ] **Task 15. `deep_freeze.rb` + `execute.rb`.** Port `deep-freeze.ts` and
  `execute.ts` (partial-merge state, positional sensor slot contract,
  `error`-fence inversion / `UnexpectedPassError`). Translate `execute.test.ts`.
- [ ] **Task 16. trace projection + `run_conformance` + full gate.** Port the
  inline trace projection in `runConformance` (per-step observations, 1-based
  ordinal, `contextKey`, `fileStem`, example-pass/step-fail split); **GATE:
  every `trace.json` byte-for-byte** → all four artifacts × 15 bundles green.
  *Commit:* `feat(ruby/var-core): execute plans and compare returns against the document`.

## MILESTONE 5 — `var-config` + config corpus

- [ ] **Task 17. `var-config` gem.** Port `var-config`'s `parseVarConfig`
  (strict, fail-loud) + `config.rb`; harness over `conformance/config/cases/*`;
  **GATE: all 8 config cases** (golden or expected-raise).
  *Commit:* `feat(ruby/var-config): read var.config.json`.

## MILESTONE 6 — drift (unit-gated, not golden-gated)

- [ ] **Task 18. `hash.rb`.** Port `hash.ts` (FNV-1a over UTF-16 units, 32-bit
  wraparound, `fnv1a:<8 hex>`). Translate `hash.test.ts`.
- [ ] **Task 19. `drift.rb` + `BaselineStore` port.** Port `drift.ts` (0.5
  Jaccard threshold, `live_examples`/`derive_spec_baseline`/`detect_drift`/
  `drift_diagnostics`/`reconcile_drift`/`parse_var_lock`/`stringify_var_lock`,
  the insertion-order `var.lock.json` serializer) and the `BaselineStore`
  interface. Translate `drift.test.ts`. Precedent: `python var_core/{hash,drift}.py`.
  *Commit:* `feat(ruby/var-core): detect spec drift with a byte-identical var.lock.json baseline`.

## Self-review

- Cross-check every design-spec module has a task; scan for placeholders/TODOs.
- Purity gate green (`var-core` has no facade/runner `require`s).
- Name/param-order parity pass against the TS/Python signatures.
- Confirm the two JSON serializers (canonical vs var.lock) stay distinct and both
  byte-stable.
