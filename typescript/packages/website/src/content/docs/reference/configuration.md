---
title: varar.config.json
description: Every key of the Varar config file — what it means, what it defaults to, and which tools read it.
---

One `varar.config.json` sits at the root of your project. It is the single
source of truth for **what is a spec** and **where the step definitions are**,
and the same file is read identically by the `varar` CLI, the language server,
and the test-framework adapters — so all of them always agree.

The file is the same in every language port. Unknown keys are an error rather
than being ignored, because a typo'd config that silently discovers nothing is
the worst failure mode this file has.

```json
{
  "$schema": "https://varar.dev/varar.config.schema.json",
  "docs": {
    "include": ["varar-examples/**/*.md"],
    "exclude": ["varar-examples/drafts/**"]
  },
  "steps": ["varar-examples/**/*.steps.ts"],
  "snippets": {}
}
```

## `docs`

An object with `include` and `exclude`, both arrays of plain globs. A file is a
spec **iff** it matches `include` and does not match `exclude`.

- There is **no default**: an empty or absent `include` discovers nothing.
- Globs are plain — no `!` prefix. Exclusion is what `exclude` is for.
- The array shorthand (`"docs": [...]`) is not accepted; the object is the
  canonical shape.

The extension does not decide anything: a file is a spec because it matches
these globs, not because it is called `.md`.

Under vitest, the plugin drives vitest's own `include`/`exclude` from these
globs; see [Run specs through vitest](/how-to/run-with-vitest/).

## `steps`

An array of globs matching your step-definition files. Also no default.

On the JVM ports this holds fully-qualified class names rather than file globs,
because that is how the JVM loads them.

## `snippets`

An object mapping a language id (e.g. `typescript`) to a step-definition
template, used by the editor's **Generate Step Definition** action. Omit it to
use the built-in template for each language. See
[Editor support](/reference/editor-support/).

## `$schema`

Accepted and ignored by Varar — it is there so your editor can validate and
complete the file.

## What is *not* in this file

The drift baseline is a separate, generated file: `varar.lock.json`, written by
the runner and committed alongside your specs. See
[Drift detection](/reference/examples/#drift-detection).
