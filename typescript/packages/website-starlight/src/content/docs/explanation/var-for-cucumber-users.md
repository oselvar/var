---
title: Vár for Cucumber users
description: What Vár keeps from Cucumber, what it drops, and why.
---

Vár is created by Aslak Hellesøy, who also created Cucumber in 2008.
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

| Cucumber | Vár |
| --- | --- |
| `.feature` files in Gherkin | Plain Markdown. No new dialect — a file is a spec iff it matches the globs in `var.config.ts`. |
| `Given` / `When` / `Then` step types | Three roles — `context`, `action`, `sensor` — chosen by what a step *does*, not by a keyword. Keywords in prose are narration for the reader; they're never matched. |
| Assertions inside step bodies | Steps *return* what the software did; Vár compares it against what the document claims, and failures are anchored to the exact span in the source. |
| `DataTable` and doc-string APIs | Native Markdown tables and fenced code blocks, checked by [return-based comparison](/how-to/tables-and-doc-strings/). |
| `World` and untyped state | `defineState` — a typed state factory per spec; every example starts fresh. |
| `Before` / `After` hooks | None in Vár. Use your test runner's own `beforeEach` / `afterEach`. |
| Tags | Not in v1. |
| A separate test-run artefact | The document *is* the test. There is no report that drifts from the docs, because the docs are what ran. |

## Migration

Our goal is to make Vár capable of running existing `.feature` files without any change to them.
There will be an adapter API for Cucumber step definitions so that all you need to do is to change
`import` statements from Cucumber to Vár.

TODO: Finish the adapter implementation and test it extensively

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
  a typed state you declare once with `defineState`. No `this`, no untyped
  `World`.
- **"Extra layer of indirection."** Vár still has that layer (step definitions).
  Only write a *few* tests in Vár - the ones that *really* matter. Use unit testing tools for the rest.
- **"Step definitions became a second implementation."** Steps that return
  values stay thin — a couple of lines delegating to your domain (see
  [Thin steps](/explanation/thin-steps/)). The assertion lives in the document,
  not the step. The logic lives in your system, not the step definitions.
- **"Feature files were a chore nobody read."** There are no feature files.
  There is documentation, and it happens to be executable.

## Next

See it in two minutes: [Try Vár in your browser](/tutorials/try-in-browser/).
