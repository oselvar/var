# ADR 0012 — Examples are delimited, not hugged

- **Status:** Accepted
- **Date:** 2026-07-22
- **Deciders:** Aslak Hellesøy
- **Tags:** spec, parsing, gfm, cross-language, breaking

## Context

An example that carries **more than one table** needs several step paragraphs
interleaved with tables in a single example (a Given → table → When → table →
Then flow, sharing one state). The only construct we documented for that was the
**hug**: a step paragraph placed directly under a table with *no blank line*
between them merged into the same example.

The hug is not valid GFM (issue #61). In GFM a table body runs until a blank
line, so a hugging paragraph is parsed as **another table row**. Every GFM
renderer (GitHub, `marked`) shows the step as a junk table cell, and every
formatter (`prettier`, `markdownlint`'s MD012) rewrites the source — silently
changing what the spec means, sometimes into a passing example that asserts
nothing. The one layout we documented for multi-table examples could not survive
contact with the tools every repo runs.

We considered three fixes (see #61): a formatter-stable **blank-line
continuation** rule, **list items as containers**, and **blockquote descent**.
All three add a new implicit rule on top of the existing adjacency machinery. In
review we concluded the implicit rules were the problem, not the mechanism — a
user cannot see, from the Markdown alone, where one example ends and the next
begins.

We also rejected **three-or-more blank lines** as a delimiter: `prettier`
collapses any run of blank lines to one and MD012 flags them, so a blank-line
count is exactly as formatter-fragile as the hug.

## Decision

**An example runs from one delimiter to the next.** There are three delimiters:

1. a Markdown **heading** (`#`…`######`),
2. a **thematic break** (`---`),
3. a **paragraph that matches no step definition** (prose).

Everything between two delimiters that contains at least one matching paragraph
is a single example. Consecutive matching paragraphs (with their attached tables
and doc strings) merge into one example sharing one state — this is what makes a
GFM-clean multi-table example work: the tables are separated by blank lines, as
GFM requires, and the step paragraphs between them still belong to one example.

Consequences that follow from the rule, by design:

- **Two adjacent step-only examples merge.** If you write several examples as
  matching paragraphs with nothing but blank lines between them, they become one
  example with shared state. Separate them with a `---` or a heading. This is the
  one migration the change forces on existing specs.
- **Prose in the middle of an example ends it.** A non-matching paragraph placed
  between the steps of one example splits it; the steps after the prose start a
  fresh example and do not see the earlier state. Keep narration out of the
  middle of an example (it is fine before or after).
- **The hug is gone**, not deprecated. A paragraph hugging a table is a table
  row, per GFM.

The rule is uniform with the long-standing principle (ADR 0002) that a paragraph
matching no step is prose the runner ignores. Prose was already a non-example;
now it is also a boundary.

## Implementation

Boundary detection splits across the existing two-stage pipeline so the core
parser stays registry-free:

- **`structure()` (pure syntax, no registry)** keeps emitting one *candidate*
  per paragraph/list-item/blockquote, with its trailing tables/fences attached.
  It drops the hug-merge branch and records one new boolean per candidate,
  `precededByDelimiter` — true when a heading or thematic break sits between this
  candidate and the previous one (and for the first candidate).
- **`plan()` (has the registry)** groups candidates: a matching candidate with
  `precededByDelimiter === false` merges into the open example; a matching
  candidate after a delimiter, or the first matching candidate, starts a new one;
  a non-matching candidate closes the open example and is dropped as prose. A
  header-bound table candidate stays standalone (it already produces one example
  per row) and never merges. The example's name is its first matching
  paragraph's text.
- **Drift (ADR 0002)** now treats a candidate as *live* when its span **overlaps**
  any planned example (was: contained one). This both fixes the merged-example
  case and closes the blind spot where a step def deleted from the middle of a
  multi-paragraph example went undetected: the now-prose paragraph splits the
  example, stops overlapping any planned example, and is reported as drift.

`precededByDelimiter` is part of the serialized `var-doc` conformance artifact,
so every port computes delimiters identically.

## Consequences

- **Breaking** (`fix(spec)!`): specs that packed multiple step-only examples
  under one heading with only blank lines between them now run as a single
  shared-state example until a `---` or heading is inserted. The reference,
  the Cucumber-migration explanation, and the dogfood specs are updated.
- Multi-table examples are now written in ordinary, formatter-stable GFM.
- The scanner and structurer get simpler (no blank-line peeking); the grouping
  logic is explicit and lives in one place (`plan()`).
