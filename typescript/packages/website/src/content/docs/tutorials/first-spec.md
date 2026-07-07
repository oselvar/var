---
title: Your first spec from scratch
description: Write a Vár spec in a blank Markdown file and bind its steps.
---

In [Get started on your computer](/tutorials/get-started/) we ran a scaffolded
example. Now we write our own from a blank file: a tiny calculator. By the end
you will have described a behaviour in prose, bound it to code, and seen the
two verify each other.

This tutorial continues in the project you set up in
[Get started](/tutorials/get-started/).

## 1. Describe the behaviour

Create `var-examples/calculator.md`:

```markdown
# Calculator

The expression `1+1` should evaluate to `2`.
```

That's the whole spec. It reads like documentation because it is documentation
— plain prose, with concrete values. The concrete values are what make it
checkable: `1+1` is the input we act with, `2` is the outcome we expect.

## 2. Bind the steps

Nothing runs yet — no step matches our sentence. Create
`var-examples/steps/calculator.steps.ts`:

```ts
import { steps } from '@oselvar/var'

const { stimulus, sensor } = steps(() => ({ result: 0 }))

stimulus('expression `{int}+{int}`', (_state, op1, op2) => ({ result: op1 + op2 }))

sensor('evaluate to `{int}`', (state, _expected) => state.result)
```

Three things to notice:

- **`steps`** declares the state each example starts from — a fresh
  `{ result: 0 }` every run, so examples never leak into each other.
- The **`stimulus`** drives the software. It matches `` expression `1+1` `` in
  the prose, computes, and returns a patch to the state.
- The **`sensor`** is the read-only observation. It returns what the software
  actually produced — `state.result` — and Vár compares that against the `2`
  written in the Markdown. You never write an assertion; the document *is* the
  assertion.

The `{int}` placeholders are [Cucumber Expressions](https://github.com/cucumber/cucumber-expressions):
they capture the concrete values from the prose and hand them to your function,
typed.

## 3. Run it

```bash
pnpm exec var run
```

```
var-examples/01-hello.md
  ✓ Hello, BDD (1ms)
var-examples/calculator.md
  ✓ Calculator (0ms)

2 examples, 2 passed, 0 failed
```

Your sentence is now an executable example.

## 4. Watch it fail

Make it a habit: every new example should be seen failing once. This time,
break the *document* — claim in `calculator.md` that `1+1` evaluates to `3`.

Run Vár again. The document demands 3, the software answers 2, and the failure
points at the `3` in your Markdown. Revert it, run once more, and you're green.

## What you just learned

- A spec is prose with concrete values; no keywords, no special file format.
- Steps come in roles chosen by what they *do*: an **action** stimulates the
  system, a **sensor** observes it. (There's also **context**, for setting up
  the starting state — you'll meet it in bigger specs.)
- A sensor *returns* the observed value instead of asserting; Vár does the
  comparison and anchors failures to the document.

## Next

- [Check tables and doc strings](/how-to/tables-and-doc-strings/) — one
  sentence per example doesn't scale; tables do.
- [Thin steps](/explanation/thin-steps/) — why step bodies should stay 2–3
  lines.
