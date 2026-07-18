---
title: Wire Varar into your AI agent's instructions
description: One-time setup so your coding agent writes a Varar spec before any production code.
---

This guide shows you how to make an AI coding agent — Claude Code, Cursor,
Copilot, anything that reads project-level instructions — default to writing a
Varar spec *before* it writes code. One-time setup per repo.

## Before you start

- A repo with Varar installed.
- An agent that reads a persistent instruction file. Common names: `AGENTS.md`,
  `CLAUDE.md`, `.cursorrules`, `.github/copilot-instructions.md`.

## 1. Find or create the instruction file

Look for an existing `AGENTS.md` or `CLAUDE.md` at the repo root. If neither
exists, create the one your agent expects; when unsure, start with `AGENTS.md`.

## 2. Add a "How we work" section

Paste this block in. Edit the wording to match your house style; the substance
is what matters.

```markdown
## How we work

We use Varar for behaviour-driven development. When you implement a feature
or fix a bug, you must:

1. Write or update a `*.md` spec before touching production code. The spec
   describes the behaviour in plain English with concrete examples.
2. Write or update the matching `*.steps.ts` step definitions.
3. Run the Varar suite and read the failures.
4. Implement the production code in small steps, running the suite after
   each step.
5. When the suite is green and you believe the feature is complete, stop
   and summarise what you changed. Do not refactor unrelated code.

The spec is the contract. If you cannot satisfy the spec, surface the
disagreement instead of changing the spec to match your implementation.
```

## 3. Add the literal test command

Underneath, add the exact command your agent should run, so it doesn't guess:

````markdown
## Running tests

```bash
pnpm test
```
````

## 4. Verify it worked

Start a fresh agent session and ask for a small feature *without* mentioning
tests. A correctly configured agent should announce it will write the spec
first, produce a `*.md` file with concrete examples before any production code,
then run the suite and iterate. If it skips straight to production code, the
instruction file isn't being read — check the file name your agent expects.

## Anti-patterns

- **Don't** paste a Varar syntax reference into the instruction file. The agent
  can read the repo's own specs and READMEs. Instructions are for *how to
  work*, not *what Varar is*.
- **Don't** write "add tests where appropriate". Vague guidance gets ignored.
  Spec first, every time.
- **Don't** let the agent edit a spec to make a failing test pass. The "spec is
  the contract" line above is load-bearing.

## Next

With the instructions in place, see
[Drive a feature with Varar and an agent](/how-to/drive-a-feature-with-an-agent/)
for the per-feature working loop.
