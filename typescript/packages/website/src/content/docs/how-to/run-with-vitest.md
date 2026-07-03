---
title: Run specs through vitest
description: Wire the Vár plugin into vitest so your Markdown specs run inside your existing test suite.
---

This guide shows you how to run Vár specs as part of a vitest suite instead of
(or alongside) the `var` CLI — one runner, one watch mode, one CI job.

It assumes Vár is already set up in your repo. If not, start with
[Get started on your computer](/tutorials/get-started/).

## 1. Install the adapter

```bash
pnpm add -D @oselvar/var-vitest vitest tsx
```

Your step definitions keep importing `@oselvar/var` — never the adapter.

## 2. Wire the plugin into vitest

In `vitest.config.ts`:

```ts
import varPlugin from '@oselvar/var-vitest'
import { VarResultsReporter } from '@oselvar/var-vitest/reporter'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [varPlugin()],
  test: {
    reporters: ['default', new VarResultsReporter()],
  },
})
```

## 3. Let var.config.ts decide what is a spec

The plugin reads `var.config.ts` and drives vitest's own `include`/`exclude`
from it — you don't repeat the globs in the vitest config:

```ts
export default {
  vars: {
    include: ['var-examples/**/*.md'],
    exclude: ['var-examples/drafts/**'],
  },
  steps: ['var-examples/**/*.steps.ts'],
}
```

A file is a spec iff it matches the `vars` globs. The same config is consulted
by the `var` CLI and the language server, so all three always agree.

## 4. Run

```bash
NODE_OPTIONS="--import tsx" npx vitest run
```

Or put it in `package.json` so nobody has to remember the flag:

```json
{
  "scripts": {
    "test": "NODE_OPTIONS=\"--import tsx\" vitest run"
  }
}
```

Your `.md` specs now appear as test files in vitest's output, watch mode, and
CI reporting, next to your ordinary `*.test.ts` files.

## Set-up and tear-down

Vár has no lifecycle hooks of its own. Use vitest's native `beforeEach` /
`afterEach` in a regular test-setup file for anything the specs need around
them (databases, servers, fixtures).
