---
title: Install Vár
description: Install and configure Vár
area: guides
order: 1
---

# Install Vár

This guide covers the TypeScript package, `@oselvar/var`. (A Python port,
`pytest-var`, also exists — dual-language tabs for this guide are coming.)
You need Node ≥ 22 LTS. It doesn't matter whether you're installing into an
existing project or starting one from scratch.

## Install

Open a terminal and add Vár as a dev dependency:

```bash
pnpm add -D @oselvar/var
```

## Scaffold a project

```bash
pnpm exec var init
```

This creates a config file and a first example, side by side:

```
created var.config.ts
created var-examples/hello-var/hello-var.md
created var-examples/hello-var/hello-var.steps.ts
```

`var.config.ts` says which files are specs and which files bind their steps:

```ts
export default {
  vars: ['var-examples/**/*.md'],
  steps: ['var-examples/**/*.steps.ts'],
}
```

And `hello-var.md` is the spec itself — plain prose with one concrete example:

```markdown
# Hello, Vár

I greet "world". The greeting should be "Hello, world!".
```

## Run it

```bash
pnpm exec var run
```

The freshly scaffolded example passes:

```
var-examples/hello-var/hello-var.md
  ✓ Hello, Vár

1 example, 1 passed
```

## Watch it fail on purpose

[Never trust a test you haven't seen fail.](/var/docs/concepts/the-oaths-of-var/)
A passing example you've never seen go red might be testing nothing at all.
Open `var-examples/hello-var/hello-var.steps.ts` and change the greeting it
produces:

```ts
action('I greet {string}', (_state, name) => ({ greeting: `Hi, ${name}!` }))
```

Run var again:

```bash
pnpm exec var run
```

Now the oath is *broken* — the spec still says `"Hello, world!"`, but the step
produces something else:

```
var-examples/hello-var/hello-var.md
  ✗ Hello, Vár
      expected "Hello, world!", actual "Hi, world!"

1 example, 0 passed, 1 failed
```

Revert the change and run once more. The oath is *kept* again:

```
1 example, 1 passed
```

## Next

- [Hello Vár: your first spec](/var/docs/start-here/hello-var-your-first-spec/) walks through writing a spec from a blank file.
- [Wire Vár into your AI agent's instructions](/var/docs/guides/wire-var-into-agent-instructions/) so an agent writes specs first.
