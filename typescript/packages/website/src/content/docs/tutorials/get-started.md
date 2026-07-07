---
title: Get started on your computer
description: Install Vár, scaffold a first spec, run it — and watch it fail on purpose.
---

In this tutorial we install Vár into a project, scaffold a working example, run
it, and then deliberately break it. By the end you will have seen a Markdown
file pass and fail as a test on your own machine.

You need Node.js ≥ 22 and pnpm. An existing project or an empty directory both
work.

## 1. Install

```bash
pnpm add -D @oselvar/var @oselvar/var-cli
```

`@oselvar/var` is the package your step definitions import. `@oselvar/var-cli`
provides the `var` command.

## 2. Scaffold a first spec

```bash
pnpm exec var init
```

```
created var.config.ts
created var-examples/01-hello.md
created var-examples/steps/01-hello.steps.ts
```

`var.config.ts` is the single source of truth for which files are specs and
which files bind their steps:

```ts
export default {
  vars: ['var-examples/**/*.md'],
  steps: ['var-examples/**/*.steps.ts'],
}
```

The spec itself is plain Markdown with one concrete example:

```markdown
# Hello, BDD

Given I greet "world"
Then the greeting is "Hello, world!"
```

Notice that `Given` and `Then` are just narration for the reader — Vár matches
the phrases, never the keywords. You could write the same example as ordinary
prose and it would still run.

The steps file binds those phrases to code:

```ts
import { steps } from '@oselvar/var'

const { stimulus, sensor } = steps(() => ({ greeting: '' }))

stimulus('I greet {string}', (_state, name: string) => ({ greeting: `Hello, ${name}!` }))

sensor('the greeting is {string}', (state, _expected: string) => state.greeting)
```

## 3. Run it

```bash
pnpm exec var run
```

```
var-examples/01-hello.md
  ✓ Hello, BDD (1ms)

1 example, 1 passed, 0 failed
```

The Markdown file just ran as a test, and the software kept its word.

## 4. Watch it fail on purpose

Never trust a test you haven't seen fail. Open
`var-examples/steps/01-hello.steps.ts` and change the greeting the stimulus
produces:

```ts
stimulus('I greet {string}', (_state, name: string) => ({ greeting: `Hi, ${name}!` }))
```

Run Vár again:

```bash
pnpm exec var run
```

The example now fails: the spec still says `"Hello, world!"`, but the sensor
observed `"Hi, world!"`. The output shows both values and points at the exact
place in the Markdown where the promise broke.

Revert the change and run once more — one example, one passed. You have seen
both sides of the contract.

## Next

- [Your first spec from scratch](/tutorials/first-spec/) — write your own spec
  in a blank Markdown file and bind its steps.
- Already have a vitest suite?
  [Run specs through vitest](/how-to/run-with-vitest/) instead of the CLI.
