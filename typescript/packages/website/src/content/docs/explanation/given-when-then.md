---
title: Given, When, Then are narration
description: Why Vár never matches keywords, and how conversations discover the examples worth writing down.
---

The concepts arrange–act–assert (given–when–then, context–action–outcome) are
still how you *write* a good example: name the state the software rests in, the
one thing you do to it, and the outcome you expect. But in Vár the concepts and
the mechanism are decoupled:

| Concept (in your prose)   | Mechanism                          |
| ------------------------- | ---------------------------------- |
| arrange / context / given | [`stimulus`](/reference/stimulus/) |
| act / action / when       | [`stimulus`](/reference/stimulus/) |
| assert / outcome / then   | [`sensor`](/reference/sensors/)    |

Arranging state and acting on it are the same mechanism — both evolve state —
so they share one step kind. Vár never matches keywords: a step is a stimulus
or a sensor by what it *does*, not by how the sentence begins. Write `Given`,
`When`, `Then` in your Markdown if it reads well; they are narration for the
human, never load-bearing.

## Where the examples come from

Given–when–then wasn't invented as a test syntax. It's the shape of a
*conversation*: someone describes a situation, an action, and what should
happen — and the rest of the group probes it. Liz Keogh's
[Conversational patterns in BDD](https://lizkeogh.com/2011/09/22/conversational-patterns-in-bdd/)
names the two questions that do the probing:

- **Context questioning** — *"Is there any other context which, when this
  event happens, will produce a different outcome?"* This is how you find the
  situations nobody thought to mention: the empty list, the expired account,
  the second click. The answers often surface domain knowledge a stakeholder
  took for granted.
- **Outcome questioning** — *"Given this context, when this event happens, is
  there another outcome that's important?"* Or, in Keogh's memorable framing:
  if pixies were doing this by hand instead of software, would this outcome be
  enough? This is how you find the side effects — the email that should also
  go out, the audit entry that should also be written.

These questions work best with mixed perspectives in the room: developers spot
branching the implementation will need, testers anticipate failure modes,
domain experts know which "obvious" rules aren't.

## Not every example becomes a Vár example

The conversation will surface far more examples than belong in your document —
and that's the point of the conversation, not a quota for the spec. A document
that tries to hold every discovered example gets so long that nobody reads it,
and nobody maintains it. Then it's no longer documentation.

Keep the document to the examples that *illustrate* — the ones a reader needs
to understand the behaviour. Push the rest down: the combinatorial edge cases,
the exhaustive boundary values, the fifth variation on the same rule all
belong in ordinary unit tests, close to the code. A healthy codebase has many
more unit tests than Vár examples.

A discovered example that doesn't make it into the document still did its job:
it changed what you build and what you test.
