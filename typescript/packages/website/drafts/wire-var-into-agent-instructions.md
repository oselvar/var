---
title: Wire Varar into your AI agent's instructions
description: One-time setup so your coding agent defaults to writing a Varar spec before any production code.
area: guides
order: 3
---

# Wire Varar into your AI agent's instructions

You want your AI coding agent — Claude Code, Cursor, Aider, Copilot agents, anything that reads project-level instructions — to default to writing a Varar spec *before* it writes code. This is a one-time setup per repo.

## Before you start

- A repo with Varar installed.
- An agent that reads a persistent instruction file. Common names: `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.github/copilot-instructions.md`. Most modern agents read at least one of these.

## Steps

### 1. Find or create the instruction file

Look for an existing `AGENTS.md` or `CLAUDE.md` at the repo root. If neither exists, create the one your agent expects. If unsure, start with `AGENTS.md` — most agents fall back to it.

### 2. Add a "How we work" section

Paste this block in. Edit the language to match your house style; the substance is what matters.

```markdown
## How we work

We use Varar for behaviour-driven development. When you implement a feature
or fix a bug, you must:

1. Write or update a `*.md` spec under the relevant package's `tests/`
   directory before touching production code. The spec describes the
   behaviour in plain English with concrete examples.
2. Write or update the matching `*.steps.ts` step definitions.
3. Run the Varar suite (via vitest) and read the failures.
4. Implement the production code in small steps, running the suite after
   each step.
5. When the suite is green and you believe the feature is complete, stop
   and summarise what you changed. Do not refactor unrelated code.

The spec is the contract. If you cannot satisfy the spec, surface the
disagreement instead of changing the spec to match your implementation.
```

### 3. Add the project's testing command

Underneath, add the literal command your agent should run, so it doesn't guess:

````markdown
## Running tests

```bash
pnpm test
```
````

### 4. Commit it

```bash
git add AGENTS.md
git commit -m "docs: instruct agents to use Varar spec-first"
```

## How to tell it worked

Start a fresh session with your agent and ask for a small new feature *without* mentioning tests. A correctly configured agent should:

- Acknowledge it will write the spec first.
- Produce a `*.md` file with concrete examples before any production code.
- Run the suite, see it fail, and iterate.

If the agent skips straight to production code, your instruction file isn't being read — check the file name and location for the agent you're using.

## Anti-patterns

- **Don't** also paste your full Varar syntax reference into the instruction file. The agent can read the package's own README and `*.md` files in the repo. Keep instructions to *how to work*, not *what Varar is*.
- **Don't** tell the agent to "write tests where appropriate". Vague guidance gets ignored. Be specific: spec first, every time.
- **Don't** let the agent edit the spec to make a failing test pass. That defeats the entire mechanism. The "spec is the contract" line above is load-bearing.
