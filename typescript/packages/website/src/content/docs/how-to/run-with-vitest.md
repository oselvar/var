---
title: Run specs through vitest
description: Wire the Varar plugin into vitest so your Markdown specs run inside your existing test suite.
---

This guide shows you how to run Varar specs as part of a vitest suite instead of
(or alongside) the `var` CLI — one runner, one watch mode, one CI job.

It assumes Varar is already set up in your repo. If not, start with
[Get started on your computer](/tutorials/get-started/).

## 1. Install the adapter

```bash
pnpm add -D @varar/vitest vitest
```

Your step definitions keep importing `@varar/varar` — never the adapter.

## 2. Wire the plugin into vitest

In `vitest.config.ts`:

```ts
import varPlugin from '@varar/vitest'
import { VarResultsReporter } from '@varar/vitest/reporter'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [varPlugin()],
  test: {
    reporters: ['default', new VarResultsReporter()],
  },
})
```

## 3. Let var.config.json decide what is a spec

The plugin reads `var.config.json` and drives vitest's own `include`/`exclude`
from it — you don't repeat the globs in the vitest config:

```json
{
  "docs": {
    "include": ["varar-examples/**/*.md"],
    "exclude": ["varar-examples/drafts/**"]
  },
  "steps": ["varar-examples/**/*.steps.ts"]
}
```

A file is a spec iff it matches the `docs.include` globs (minus `docs.exclude`).
The same config is consulted by the `var` CLI and the language server, so all
three always agree.

## 4. Run

```bash
npx vitest run
```

Your `.md` specs now appear as test files in vitest's output, watch mode, and
CI reporting, next to your ordinary `*.test.ts` files.

## Set-up and tear-down

Varar has no lifecycle hooks of its own. Use vitest's native `beforeEach` /
`afterEach` in a regular test-setup file for anything the specs need around
them (databases, servers, fixtures).
