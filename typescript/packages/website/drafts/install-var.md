---
title: Install Varar
description: Install and configure Varar
area: guides
order: 1
---

# Install Varar

This guide covers the TypeScript package, `@varar/varar`. (A Python port,
`pytest-varar`, also exists — dual-language tabs for this guide are coming.)
You need Node ≥ 22 LTS. It doesn't matter whether you're installing into an
existing project or starting one from scratch.

## Install

Open a terminal and add Varar as a dev dependency:

```bash
pnpm add -D @varar/varar
```

## Scaffold a project

```bash
pnpm exec var init
```

This creates a config file and a first example, side by side:

```
created var.config.json
created varar-examples/hello-var/hello-var.md
created varar-examples/hello-var/hello-var.steps.ts
```

`var.config.json` says which files are specs and which files bind their steps:

```json
{
  "docs": { "include": ["varar-examples/**/*.md"], "exclude": [] },
  "steps": ["varar-examples/**/*.steps.ts"]
}
```

And `hello-var.md` is the spec itself — plain prose with one concrete example:

```markdown
# Hello, Varar

I greet "world". The greeting should be "Hello, world!".
```

## Run it

```bash
pnpm exec var run
```

The freshly scaffolded example passes:

```
varar-examples/hello-var/hello-var.md
  ✓ Hello, Varar

1 example, 1 passed
```

## Watch it fail on purpose

[Never trust a test you haven't seen fail.](/var/docs/concepts/the-oaths-of-var/)
A passing example you've never seen go red might be testing nothing at all.
Open `varar-examples/hello-var/hello-var.steps.ts` and change the greeting it
produces:

```ts
stimulus('I greet {string}', (_state, name) => ({ greeting: `Hi, ${name}!` }))
```

Run var again:

```bash
pnpm exec var run
```

Now the oath is *broken* — the spec still says `"Hello, world!"`, but the step
produces something else:

```
varar-examples/hello-var/hello-var.md
  ✗ Hello, Varar
      expected "Hello, world!", actual "Hi, world!"

1 example, 0 passed, 1 failed
```

Revert the change and run once more. The oath is *kept* again:

```
1 example, 1 passed
```

## Next

- [Hello Varar: your first spec](/var/docs/start-here/hello-var-your-first-spec/) walks through writing a spec from a blank file.
- [Wire Varar into your AI agent's instructions](/var/docs/guides/wire-var-into-agent-instructions/) so an agent writes specs first.
