# ADR 0001 — Python as the second supported language

- **Status:** Accepted
- **Date:** 2026-06-28
- **Deciders:** Aslak Hellesøy
- **Tags:** strategy, language-support, lsp, cross-language

## Context

`var` currently supports TypeScript only. The product vision is to support multiple
programming languages; we will add them one at a time. We need to choose the **second**
language.

Two goals shape the decision, in priority order:

1. **Primary — ride the agentic wave.** Position `var` where AI-assisted developers
   already are, betting that well-specified, executable examples become *more* valuable
   in an agentic world (Gherkin-free markdown examples as the contract between human
   intent and agent output).
2. **Secondary — capture orgs already doing BDD**, by offering a better tool than the
   incumbents they currently use.

We evaluated candidate languages against three criteria:

- **(a) Agentic-coding adoption** — is the community an early mover or a laggard?
- **(b) BDD / Cucumber adoption** — how strong is the existing test-automation culture,
  and how entrenched/beatable are the incumbents?
- **(c) General popularity** — total addressable market.

### Candidate comparison

| Language   | (a) Agentic adoption                | (b) BDD culture & incumbent                          | (c) Popularity        |
|------------|-------------------------------------|------------------------------------------------------|-----------------------|
| **Python** | Highest — lingua franca of agentic  | Moderate, but **incumbents are stagnant/beatable**   | #1–2                  |
| Java       | Laggard (enterprise-conservative)   | Highest — Cucumber-JVM, mature & **entrenched**      | Top 4                 |
| .NET / C#  | Growing (MS pushing Copilot)        | Strong — Reqnroll (ex-SpecFlow), solid incumbent     | Top 5                 |
| Go         | Growing, pragmatic                  | Moderate — `godog`, but table-test culture           | Top 10, rising        |
| Rust       | Enthusiastic early adopters         | Niche — `cucumber-rs` small                          | Smaller               |
| Ruby       | Laggard, shrinking                  | Birthplace of Cucumber/BDD                           | Declining             |
| Zig        | n/a                                 | None                                                 | Tiny                  |

## Decision

**We will support Python as the second language.**

Python is the only candidate that wins on two of the three axes (agentic adoption +
popularity) *and* faces a soft incumbent on the third:

- **(a) Center of gravity for agentic coding.** Python is where AI-assisted developers
  already work. This directly serves the primary goal.
- **(c) Largest addressable market**, combining raw size with growth.
- **(b) The BDD incumbents are beatable.** `behave` is effectively unmaintained;
  `pytest-bdd` is a thin, awkward layer over pytest. There is no beloved leader and a
  real quality gap — the opposite of Java's Cucumber-JVM or .NET's Reqnroll, which are
  excellent and entrenched. This makes the *secondary* goal achievable too: we can win
  existing Python BDD users with a better tool rather than fighting uphill against a
  tool the community already loves.

The intuitive "go where BDD is strongest" move (Java / .NET) is a trap for a young tool:
it means competing against mature, loved incumbents inside communities that are *slow* to
adopt new tooling. Python inverts that — huge market, strongest agentic community, and a
displaceable incumbent.

## Consequences

### Positive

- Maximum reach into the agentic developer population (primary goal).
- A credible path to converting existing Python BDD users (secondary goal).
- Validates the multi-language architecture against a dynamically-typed language,
  which stresses the design differently than TypeScript and surfaces cross-language
  abstractions early.

### Negative / risks

- Python's packaging and dynamic-typing friction complicate the adapter/shell layer
  (step discovery, module loading, type-driven affordances) relative to TypeScript.
- Diagnostics and step-def generation that lean on TS type information have no direct
  Python equivalent; affordances must degrade gracefully.

## Cross-language architecture implication: tree-sitter

Adding a second language forces a decision about how language-specific parsing is done in
the layers that must understand *host-language source* (step definitions), as opposed to
the markdown example layer (which is already language-agnostic).

**We will evaluate adopting [tree-sitter](https://tree-sitter.github.io/) in the layers
that need cross-language source understanding — in particular the LSP layer.** Motivation:

- A single, uniform parsing interface across many languages, instead of one bespoke
  parser per language.
- Incremental, error-tolerant parsing with byte-precise source ranges — a good fit for
  the existing commitment to byte-precise positions on both sides (markdown ↔ step
  definition) that underpins the LSP/VSCode work.
- Mature grammars already exist for every candidate language, lowering the marginal cost
  of each *additional* language after Python.

This keeps the **functional core** pure: tree-sitter parsing lives in the imperative
shell / adapter and LSP layers, which produce immutable ASTs/position data the core
consumes. The core never gains a runtime dependency on tree-sitter or any host-language
toolchain.

> This is a direction, not yet a committed implementation. A follow-up ADR should record
> the concrete tree-sitter adoption decision (which layers, which bindings, build/packaging
> impact) once the Python adapter work makes the requirements concrete.

## Proving consistency across implementations

Adding a second language is only safe if we can *prove* that every language behaves
identically where it must, and differs only where it legitimately should (host-language
syntax). The strategy has two halves: (1) identify the **seams** where behaviour must be
shared vs. where it may diverge, and (2) drive every implementation through a **single
shared conformance test suite**.

We draw inspiration from [cucumber/language-service](https://github.com/cucumber/language-service),
which supports ~12 languages from one TypeScript codebase by feeding *glue source code*
through **tree-sitter** to extract step-definition expressions. The language-specific part
is reduced to a small set of **tree-sitter queries + node-type mappings**; everything
downstream (indexing, suggestion building, the `getXxx` LSP feature functions) is shared
and language-agnostic.

### The seams

We classify each layer as **shared** (one implementation, all languages) or **per-language**
(an adapter behind a port). The goal is to push the per-language surface to the smallest
possible boundary.

| Layer                                   | Shared / per-language | Notes                                                                 |
|-----------------------------------------|-----------------------|-----------------------------------------------------------------------|
| Markdown example parser → example AST   | **Shared**            | Already language-agnostic; identical bytes in, identical AST out.     |
| Cucumber-expression ↔ example matching  | **Shared**            | Pure core. Same matcher, same parameter types, same diagnostics.      |
| Step-definition **extraction** from source | **Per-language**   | A tree-sitter grammar + a small query set per language. **The seam.** |
| Step indexing, ambiguity, suggestions   | **Shared**            | Consumes the extracted, normalised step records.                      |
| LSP feature functions (`getXxx`)        | **Shared**            | Completion, go-to-def, document symbols, semantic tokens, etc.        |
| Snippet / step-def **generation**       | **Per-language**      | Emits host-language source; behind a port. Selection-only — no keyword (Given/When/Then) heuristics. |
| Runtime / test-runner adapter           | **Per-language**      | `var-vitest`, `var-node`, `var-bun`, and the future `var-pytest`.     |

The single most important seam is **step-definition extraction**: the per-language tree-sitter
query that turns host source into a normalised, immutable list of
`{ expression, sourceRange, parameterTypes }` records. Above that line, *nothing* knows the
language. This is the boundary the cucumber/language-service architecture validates, and it
is where the bulk of cross-language risk lives.

### Shared LSP with tree-sitter adapters

There is **one** LSP implementation, in the functional core / shared layer. It depends only
on the normalised step records and the example AST — never on a host language. Each supported
language contributes a **tree-sitter adapter**: a grammar plus a query set that satisfies the
extraction port. Adding a language to the LSP is therefore "add a grammar + queries + fixtures",
not "fork the language server". Tree-sitter parsing runs in the imperative shell; the core
consumes immutable results.

### Shared conformance test suite

We will maintain a **language-agnostic conformance suite** that is parametrised over every
supported implementation, modelled on cucumber/language-service's per-language `testdata`
approach:

- **Per-language fixtures, shared expectations.** For each conformance case there is one
  language-neutral *expectation* (e.g. "this source defines a step `a {int} cukes` at
  range R; completing at position P offers X; go-to-definition resolves to D"). Each language
  provides a *fixture* — the equivalent step-definition source in that language — and the
  harness asserts the **same** expectation against every language's fixture.
- **Golden files.** Extraction output, diagnostics, and LSP responses are serialised to
  golden snapshots. A new language passes when its goldens match the shared expectation; a
  shared-layer change that alters behaviour must update all languages' goldens in one commit,
  making any accidental divergence visible in review.
- **Coverage matrix.** A new language is "supported" only when it is green across the full
  matrix: extraction, matching, ambiguity diagnostics, completion, go-to-definition, document
  symbols, semantic tokens, and step-def generation round-trips. Gaps are recorded explicitly
  (logged, not silently skipped).
- **Dogfooding stays per-runtime.** The existing `*.var.md` dogfood suites continue to run
  under each runtime adapter (vitest/node/bun, and pytest for Python), proving the *runtime*
  integration end-to-end, while the conformance suite proves *cross-language equivalence* of
  the shared layers.

### Consequence for the rollout

Python is therefore not just "the next adapter" — it is the forcing function that makes us
build the extraction seam, the tree-sitter adapter interface, and the shared conformance
suite. Doing this work for the *second* language is what makes the *third* (Go, Java, …) a
matter of "grammar + queries + fixtures."

## Alternatives considered

- **Java** — best BDD culture and large market, but agentic laggard with an entrenched,
  excellent incumbent (Cucumber-JVM). Best choice *only* if the primary goal were
  converting existing BDD practitioners rather than riding the agentic wave.
- **Go** — strong agentic momentum and a not-loved incumbent (`godog`); a good fit for
  `var`'s design values (immutable, pure-functional core). Smaller market than Python;
  reconsider as a later language.
- **Ruby** — right culture (BDD's birthplace), wrong trajectory (shrinking).
- **.NET / C#** — growing agentic adoption but a solid incumbent (Reqnroll) and a more
  enterprise-conservative community.
- **Rust** — enthusiastic early adopters but too small to be the *second* language.
- **Zig** — no BDD culture; out of scope.
