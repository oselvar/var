---
title: Run specs through vitest
description: Wire the Varar plugin into vitest so your Markdown specs run inside your existing test suite.
---

This guide shows you how to run Varar specs as part of a vitest suite instead of
(or alongside) the `varar` CLI — one runner, one watch mode, one CI job.

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
import vararPlugin from '@varar/vitest'
import { VararResultsReporter } from '@varar/vitest/reporter'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vararPlugin()],
  test: {
    reporters: ['default', new VararResultsReporter()],
  },
})
```

## 3. Let varar.config.json decide what is a spec

The plugin reads `varar.config.json` and drives vitest's own `include`/`exclude`
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
The same config is consulted by the `varar` CLI and the language server, so all
three always agree.

The plugin does this by **replacing** vitest's `test.include` and `test.exclude`
(vitest's default excludes, like `node_modules`, are kept). In a repo that also
has ordinary unit tests, scope the plugin to its own project so it doesn't
clobber their globs:

```ts
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['src/**/*.test.ts'] } },
      { plugins: [vararPlugin()], test: { name: 'specs' } },
    ],
  },
})
```

## 4. Run

```bash
npx vitest run
```

Your `.md` specs now appear as test files in vitest's output, watch mode, and
CI reporting, next to your ordinary `*.test.ts` files.

## Accept drift

When a paragraph that used to be an example stops matching any step, the run
fails as [drift](/reference/examples/#drift-detection). The plugin only *reads*
the baseline, so accepting it takes two steps:

```bash
VARAR_UPDATE=1 npx vitest run   # let this run go green
npx varar run --update          # re-record varar.lock.json
```

Commit the updated `varar.lock.json` — that is what makes the acknowledgment
visible in review.

## Set-up and tear-down

Varar has no lifecycle hooks of its own. Use vitest's native `beforeEach` /
`afterEach` in a regular test-setup file for anything the specs need around
them (databases, servers, fixtures).

Note that `afterEach` cannot see the example's state: the state factory is
per-step-file and the value never leaves the run. Anything that needs tearing
down must also be reachable from outside the state — for example, have the
stimulus that creates it record it in module scope in the steps file, and tear
that down in `afterEach`.
