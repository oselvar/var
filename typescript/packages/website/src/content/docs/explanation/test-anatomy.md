---
title: Test anatomy
description: Every example has a context, an action, and an outcome — and in Varar those map onto two step kinds, not three keywords.
---

Every good example has three parts: the state the software rests in, the one
thing you do to it, and the outcome you expect. Two well-worn naming schemes
describe those same three parts:

| The part                | Names                       |
| ----------------------- | --------------------------- |
| the state you start in  | **Arrange** · **Context**   |
| the one thing you do    | **Act** · **Action**        |
| the outcome you check   | **Assert** · **Outcome**    |

That's how you *think* about an example, whichever vocabulary you reach for. (If
you came from BDD you'll recognise the same shape as *given–when–then* — those
are just the three parts wearing keywords.)

Varar's mechanism, though, has only **two** kinds. Arranging state and acting on
it both *evolve state*, so they collapse into a single step kind:

| The part          | Mechanism                          |
| ----------------- | ---------------------------------- |
| Arrange / Context | [`stimulus`](/reference/stimuli/)  |
| Act / Action      | [`stimulus`](/reference/stimuli/)  |
| Assert / Outcome  | [`sensor`](/reference/sensors/)    |

Varar never matches keywords: a step is a stimulus or a sensor by what it *does*,
not by how the sentence begins. You may write the words `Given`, `When`, `Then`
in your Markdown if they read well — but they're narration for the human, never
load-bearing.

## Where the examples come from

The context–action–outcome shape wasn't invented as a test syntax. It's the
shape of a *conversation*: someone describes a situation, an action, and what
should happen — and the rest of the group probes it. Liz Keogh's
[Conversational patterns in BDD](https://lizkeogh.com/2011/09/22/conversational-patterns-in-bdd/)
names the two questions that do the probing:

- **Context questioning** — *"Is there any other context which, when this
  event happens, will produce a different outcome?"* This is how you find the
  situations nobody thought to mention: the empty list, the expired account,
  the second click. The answers often surface domain knowledge a stakeholder
  took for granted.
- **Outcome questioning** — *"In this context, when this event happens, is
  there another outcome that's important?"* Or, in Keogh's memorable framing:
  if pixies were doing this by hand instead of software, would this outcome be
  enough? This is how you find the side effects — the email that should also
  go out, the audit entry that should also be written.

These questions work best with mixed perspectives in the room: developers spot
branching the implementation will need, testers anticipate failure modes,
domain experts know which "obvious" rules aren't.

## Not every example becomes a Varar example

The conversation will surface far more examples than belong in your document —
and that's the point of the conversation, not a quota for the spec. A document
that tries to hold every discovered example gets so long that nobody reads it,
and nobody maintains it. Then it's no longer documentation.

Keep the document to the examples that *illustrate* — the ones a reader needs
to understand the behaviour. Push the rest down: the combinatorial edge cases,
the exhaustive boundary values, the fifth variation on the same rule all
belong in ordinary unit tests, close to the code. A healthy codebase has many
more unit tests than Varar examples.

A discovered example that doesn't make it into the document still did its job:
it changed what you build and what you test.
