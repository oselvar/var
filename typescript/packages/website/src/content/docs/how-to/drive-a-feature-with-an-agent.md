---
title: Drive a feature with Varar and an agent
description: The per-feature loop — talk in customer language, let the agent specify, then iterate on the spec, not the code.
---

This guide shows you the working loop for building one feature with an AI agent
once Varar is wired into its instructions (see
[Wire Varar into your AI agent's instructions](/how-to/agent-instructions/)).

## 1. Brief the agent in customer language

Describe the behaviour as if briefing someone non-technical. Name the actor,
the trigger, the precondition, and the observable outcome — not the
implementation:

> "When a user submits a booking with an empty name, the form should refuse it
> and show a message that says the name is required."

## 2. Let the agent write the spec — and read it

A correctly instructed agent will create or extend a `*.md` file with a
concrete example matching your description. **Read it before letting the agent
continue.** The spec is the one artefact you must understand fully; the
production code can be regenerated, the spec cannot.

If the spec doesn't say what you meant, push back now. "The spec doesn't cover
a whitespace-only name" is a much cheaper conversation than "the code is wrong
in production".

## 3. Let the agent run Varar and implement

The agent runs the suite, sees the new example fail, and implements. You don't
need to watch every step — but do watch for:

- The agent **editing the spec** to make a failure go away. Stop it. That
  breaks the contract.
- The agent silently changing *other* specs that previously passed. Stop it and
  ask why.

## 4. Iterate on the spec, not the code

When the agent shows you a green suite, your review is of the spec, not the
diff. Are there missing examples? Edge cases? Error paths? Add them; let the
agent fill in the implementation. Repeat until the spec is honest and the suite
is green.

## 5. Commit when the spec is honest

A commit means: the spec captures what we want, and the suite proves the code
satisfies it. Describe the *behaviour* in the message:

```
feat: refuse bookings with empty or whitespace-only names
```

not the implementation (`feat: add name validator to BookingForm`). The first
survives a refactor; the second doesn't.

## When to step in

Signs the loop isn't converging — and in all three cases the spec is the
problem, not the agent:

- The agent rewrites large amounts of unrelated code to pass one example →
  your spec is coupled to internals; rewrite it in higher-level language.
- The agent's step definitions re-implement production logic → steps should
  *exercise* the system, not duplicate it (see
  [Thin steps](/explanation/thin-steps/)).
- The suite is green but you can't tell from the spec what the system does →
  the spec is written for the machine, not for a reader.

## Anti-patterns

- **Don't** prompt with "make the tests pass". Prompt with the behaviour; the
  tests are a consequence.
- **Don't** review every generated line. Review whether the right thing was
  specified.
- **Don't** run the loop unattended on risky surface area. The agent satisfies
  what you *said*, not what you *meant*.
