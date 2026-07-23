---
title: Varar for Cucumber users
description: What Varar keeps from Cucumber, what it drops, and why.
---

Varar is created by Aslak Hellesøy, who also created Cucumber in 2008.
The goal is to keep only the good parts, and align it with agentic coding.

If you've used Cucumber before — whether you
loved it or swore never again — this page maps the old concepts onto the new
ones and explains what was dropped on purpose.

## What survives

The heart of BDD is intact: **concrete examples as a shared, executable
contract** between the people who want the software and the people who build
it. [Cucumber Expressions](https://github.com/cucumber/cucumber-expressions)
(`{int}`, `{string}`, custom parameter types) survive too — steps are still
bound by matching phrases in the text.

## What changed

| Cucumber | Varar |
| --- | --- |
| `.feature` files in Gherkin | Plain Markdown specs. Varar has no Gherkin parser and does not run `.feature` files — a spec is any file matching the `docs` globs in `varar.config.json`. |
| `Given` / `When` / `Then` step types | Two roles — `stimulus` and `sensor` — chosen by what a step *does*, not by a keyword. Keywords in prose are narration for the reader; they're never matched. |
| Assertions inside step bodies | Steps *return* what the software did; Varar compares it against what the document claims, and failures are anchored to the exact span in the source. |
| `DataTable` and doc-string APIs | Native Markdown tables and fenced code blocks, checked by [return-based comparison](/how-to/tables-and-doc-strings/). |
| `Scenario Outline` + `Examples:` table | A [**header-bound table**](/reference/examples/#header-bound-tables): one step whose parameters name every column, and each data row runs as its own example. |
| `World` and untyped state | `steps` — a typed state factory per spec; every example starts fresh. |
| `Before` / `After` hooks | None in Varar. Use your test runner's own `beforeEach` / `afterEach`. |
| `Background:` | No equivalent. Inline its steps into the examples that need them. |
| Tags | Not in v1. |
| A separate test-run artefact | The document *is* the test. There is no report that drifts from the docs, because the docs are what ran. |

## Migrating from Cucumber

Varar does not run `.feature` files, and there is no Gherkin compatibility layer
to configure — a Varar spec is just Markdown. To migrate, hand your `.feature`
files and step definitions to a coding agent and ask it to translate them into
Markdown specs and Varar step definitions. Agents are good at this mechanical
translation, and the result reads as documentation rather than a dialect only
the test suite parses.

What to expect in the translated result:

- **Each `Scenario:` becomes one example** — a paragraph, or several paragraphs
  sharing state, under a heading. Its steps become `stimulus` / `sensor` calls.
- **A `Scenario Outline` with an `Examples:` table becomes a
  [header-bound table](/reference/examples/#header-bound-tables)** — a single
  step whose parameters name the columns, with each row running as its own test.
- **`Background:` is inlined** into the examples that need it (there are no
  lifecycle hooks in the BDD layer).
- **Unmatched lines become prose.** There is no undefined-step report: in
  Cucumber an unmatched step is an error with a generated snippet; in Varar an
  unmatched sentence is simply prose, which is what lets the document be a
  document. The failure that actually matters — a paragraph that *used* to be an
  example and quietly stopped being one — is caught by drift detection, which
  fails the run.

## If you loved Cucumber

Everything you valued — examples first, ubiquitous language, a spec readable by
non-programmers — is still the point. What's gone is the ceremony around it:
the separate Gherkin dialect, the parallel artefact that only the test suite
ever read. Your specs live in ordinary Markdown, so they render on GitHub, in
your docs site, in your editor — and they fail your build when they stop being
true.

## If you hated Cucumber

The usual complaints, taken seriously:

- **"Regex glue and mystery state."** Steps bind with Cucumber Expressions and
  a typed state you declare once with `steps`. No `this`, no untyped
  `World`.
- **"Extra layer of indirection."** Varar still has that layer (step definitions).
  Only write a *few* tests in Varar - the ones that *really* matter. Use unit testing tools for the rest.
- **"Step definitions became a second implementation."** Steps that return
  values stay thin — a couple of lines delegating to your domain (see
  [Thin steps](/explanation/thin-steps/)). The assertion lives in the document,
  not the step. The logic lives in your system, not the step definitions.
- **"Feature files were a chore nobody read."** There are no feature files.
  There is documentation, and it happens to be executable.

## Next

See it in two minutes: [Try Varar in your browser](/tutorials/try-varar/).
