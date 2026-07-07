# ADR 0004 — Ruby as a supported language

- **Status:** Accepted
- **Date:** 2026-07-07
- **Deciders:** Aslak Hellesøy
- **Tags:** strategy, language-support, ruby, cross-language

## Context

`var` supports TypeScript, Python, Java, and Kotlin. [ADR 0001](0001-second-language-python.md)
chose Python as the *second* language and, in its candidate comparison,
explicitly set **Ruby** aside — "right culture (BDD's birthplace), wrong
trajectory (shrinking)." That judgement was about which language to prioritise
*first*, when only one slot was open and the goal was to ride the agentic wave
into the largest, most displaceable market. It was never a permanent veto.

The situation is now different in two ways that reopen Ruby:

1. **The cost of an additional port has collapsed.** The seam work ADR 0001
   predicted — a language-neutral conformance corpus, a pure functional core
   mirrored per language, a thin runner + adapter shell — is done and proven
   four times over. Adding a language is now "translate the cited algorithm,
   reproduce the goldens byte-for-byte," a well-trodden path (the
   [`adding-a-language-port`](../../.claude/skills/adding-a-language-port/SKILL.md)
   skill). The marginal risk of Ruby is low and bounded.
2. **Ruby is BDD's birthplace and still its cultural home.** Cucumber, RSpec,
   and the whole "executable specification" idea grew up in Ruby. That is
   exactly the audience `var`'s *secondary* goal targets — orgs already doing
   BDD who would adopt a better tool. Ruby's incumbents (Cucumber-Ruby, the
   `turnip`/`spinach` lineage) are mature but ageing, and none offers `var`'s
   Markdown-native, Gherkin-free, return-based model. The cultural fit that made
   Ruby "right culture" in ADR 0001 is a genuine asset once the port is cheap.

Ruby has **no runtime interop** with any existing port (unlike Kotlin, which
sits on the Java engine because both are JVM bytecode). So — like Python — Ruby
is a **full pipeline port**: its own pure core mirroring `@oselvar/var-core`,
proven by the shared conformance corpus, not a facade over another engine.

## Decision

**We will support Ruby as a full language port**, following the Python
precedent module-for-module. Concretely:

- A `ruby/` Bundler workspace of six gems mirroring the Python layout:
  `oselvar-var-core`, `oselvar-var`, `oselvar-var-config`, `oselvar-var-runner`,
  and **two** test-framework adapters — `oselvar-var-rspec` (primary) and
  `oselvar-var-minitest` — mirroring Python's pytest + unittest pair.
- The pure core reproduces every bundle's four conformance artifacts, the
  config corpus, and (unit-gated) the drift feature, byte-for-byte.
- Ruby depends on the official **`cucumber-cucumber-expressions`** gem pinned to
  the same `20.0.0` every other port uses — no hand-port of the expression
  grammar.

The two-adapter choice matches Ruby's reality: RSpec is the dominant framework
(the natural analogue of pytest), and Minitest ships with Ruby and is the
zero-dependency analogue of Python's `unittest`. Shipping both proves the
adapter seam against two very different collection models, exactly as the Python
port did.

## Consequences

### Positive

- Direct reach into BDD's home community with a tool that has no equivalent
  there — serving ADR 0001's *secondary* goal (convert existing BDD users).
- A second dynamically-typed full port (after Python) further validates that the
  core abstractions are not TypeScript-shaped; anything Ruby forces is a real
  cross-language signal.
- Cheap: the conformance corpus and the completed Python port make "done" an
  objective, mechanical target.

### Negative / risks

- **UTF-16 offset conversion.** Ruby strings are code-point indexed, so Ruby —
  like Python — needs an explicit UTF-16 conversion layer (`span`, the matcher's
  capture-group offsets, and the drift `hash`). This is the single riskiest part
  of the port; it is gated by the multibyte bundles `11-emoji-offsets` and
  `12-combining-marks`.
- Ruby has no first-class monorepo workspace tool; the `ruby/` workspace is a
  Bundler `path:`-gem arrangement (see the core design spec), a little less
  turnkey than pnpm/uv/Maven but well-understood.
- LSP / editor / snippet-generation stay TypeScript-only (per ADR 0001's seam
  table); the Ruby port is a runtime port only.

## Alternatives considered

- **A facade over an existing engine (as Kotlin does over Java).** Rejected:
  there is no shared runtime between Ruby (MRI/CRuby) and any ported language.
  JRuby-on-the-JVM could in principle call the Java engine, but that would tie
  Ruby support to the JVM and exclude the MRI users who are the whole point.
  Ruby is a full port.
- **RSpec only (defer Minitest).** A reasonable smaller v1, but Minitest is
  nearly free once the runner exists (it is the simpler collection model) and
  proves the adapter seam a second way; we ship both.
- **Not adding Ruby.** Rejected — ADR 0001's "wrong trajectory" concern was a
  *prioritisation* argument under scarcity, not an argument that Ruby users
  aren't worth serving once the marginal cost is low. It now is.

## References

- [ADR 0001 — Python as the second language](0001-second-language-python.md) —
  the seams table and conformance strategy this port inherits unchanged; the
  candidate comparison that set Ruby aside as the *second* language.
- [ADR 0005 — Ruby RSpec + Minitest integration](0005-ruby-test-framework-integration.md).
- [`adding-a-language-port` skill](../../.claude/skills/adding-a-language-port/SKILL.md).
- Reference port to mirror: `python/packages/*`.
