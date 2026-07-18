---
title: Drive a feature with Varar and an AI agent
description: The per-feature loop once your agent is wired up — talk in customer language, let the agent specify, then iterate on the spec.
area: guides
order: 2
---

# Drive a feature with Varar and an AI agent

This is the per-feature working loop once your agent is wired up to use Varar (see [Wire Varar into your AI agent's instructions](wire-var-into-agent-instructions)).

## Before you start

- Varar installed in the repo.
- Agent instructions in place — the agent must already know to write specs first.
- A clear idea of *what* the feature is, even if the *how* is open.

## Steps

### 1. Talk to the agent in customer language

Describe the behaviour you want as if you were briefing someone non-technical. Do not prescribe an implementation.

> *"When a user submits a booking with an empty name, the form should refuse it and show a message that says the name is required."*

Good. You've named the actor, the trigger, the precondition, and the observable outcome.

### 2. Let the agent write the spec

A correctly instructed agent will create or extend a `*.md` file with a concrete example matching your description. Read it before letting the agent continue. The spec is the one artefact you must understand fully — the production code can be regenerated; the spec cannot.

If the spec doesn't match what you meant, push back now, not later. "The spec doesn't say what happens when the name is whitespace-only" is a much cheaper conversation than "the code is wrong in production".

### 3. Let the agent run Varar and read the failures

The agent should run the Varar suite (via vitest), see the new example fail, and start implementing. You don't need to watch each step. What you do need to watch:

- Is the agent editing the spec to make the failure go away? Stop it. That breaks the contract.
- Is the agent silently changing other specs that previously passed? Stop it. Ask why.

### 4. Iterate on the spec, not the code

When the agent shows you a green suite, your review is of the spec, not the diff. Ask:

- Are there examples we're missing? Edge cases? Error paths?
- Does the spec say what we actually want, or did we settle?

Add the missing examples. Let the agent fill in the implementation. The cycle repeats until the spec is honest and the suite is green.

### 5. Commit when the spec is honest

A commit means: the spec captures what we want, and the suite proves the code satisfies it. The commit message describes the *behaviour* added, not the implementation:

```
feat: refuse bookings with empty or whitespace-only names
```

Not:

```
feat: add name validator to BookingForm
```

The first survives a refactor; the second doesn't.

## When to step in

The loop above assumes the agent will converge. Sometimes it won't. Signs to stop and intervene:

- The agent is rewriting large amounts of unrelated code to pass one new example. Your spec is probably too coupled to internals — back out and rewrite it in higher-level language.
- The agent is generating step definitions that re-implement production logic. Your steps should *exercise* the system, not duplicate it.
- The suite is green but you can't tell from the spec what the system does. Your spec is incomplete or written for the machine, not for a human reader.

In all three cases the spec is the problem, not the agent. Fix it there.

## Anti-patterns

- **Don't** prompt with "make the tests pass". Prompt with the behaviour. The tests are a consequence, not the goal.
- **Don't** review every line of generated code. You're reviewing whether the right thing was specified, not whether the agent typed it correctly.
- **Don't** let the loop run unattended on something risky. The agent will satisfy *what you said*, not *what you meant*. Risky surface area still wants a human on the spec.
