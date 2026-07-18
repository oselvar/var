---
title: The oaths of Varar
description: Cucumber didn't fail by accident — it failed in specific, repeatable ways. Varar is a set of oaths sworn against each one.
area: concepts
order: 3
---

# The oaths of Varar

[BDD and Cucumber declined for specific reasons](/var/docs/concepts/the-decline-of-bdd-and-cucumber/) — not bad luck, but the same handful of failure modes, over and over. Feature files the business never read. Gherkin that rotted into test code in disguise. Slow, flaky suites wired to the UI. A brittle glue layer maintained by hand.

Varar is named for the Norse goddess of oaths and agreements. She harkens to the vows people make, and takes vengeance on those who break them.

> Níunda Varar, hon hlýðir á eiða manna ok einkamál, er veita sín á milli konur ok karlar. Því heita þau mál várar. Hon hefnir ok þeim, er brigða.

> The ninth is Varar: she harkens to the oaths and compacts made between men and women; wherefore such covenants are called 'vows.' She also takes vengeance on those who perjure themselves.

That conceit is not decoration. Every design decision in Varar is an oath sworn against one of the ways Cucumber died. Here they are.

## The first oath: the spec is just Markdown

Cucumber asked you to learn a dialect. Gherkin is a DSL — its own grammar, its own files, its own tooling — and a dialect is something the business has to be taught before it can read, let alone write. Most never were.

A Varar spec is a Markdown file ending in `.md`. Prose, with concrete examples written inline. There is no `Feature:`, no `Scenario:`, no indentation grammar to get wrong. If you can write a paragraph that names a context, an action, and an expected outcome, you've written a spec.

The point is that the document is *already* the document. It reads as reference documentation — a place people go to understand what the system does — because that's literally what it is. There's no separate business-readable artifact to keep in sync with the executable one. They're the same file.

## The second oath: keywords are narration, never matched

This is where Gherkin rotted fastest. `Given`/`When`/`Then` were structural keywords, so authors started writing *to* the structure — and the structure pulled them toward `Given I click… When I wait 3 seconds… Then the modal appears`. Test code in a prose costume.

Varar has no `Given`, `When`, or `Then` exports. Step definitions are written with three role functions — `context`, `action`, and `sensor` — chosen by what a step *does* (set up state, perform an action, observe a result), never by a keyword in the prose. Keywords, if you use them at all, are narration for the human reader — they are never matched, never parsed, never load-bearing. A step binds to a *sentence*, a paragraph of ordinary prose, not to a clause that begins with a magic word.

When the keyword carries no mechanical weight, the incentive to write robotic click-by-click scenarios disappears. You describe behaviour, because describing behaviour is the only thing the tool rewards.

## The third oath: the example is the unit, not the click

Cucumber's worst suites lived next to the browser — thousands of imperative UI scripts, slow and flaky, each a reworded sentence away from breaking. The tool didn't force that, but its shape encouraged it.

Varar matches an example from a paragraph and hands the matched spans to your step definition. The example expresses a business rule with concrete names, dates, and numbers — not a sequence of UI gestures. Where you bind that example is your choice, and the cheapest, most stable place is almost never the UI. Tables make this sharper still: write a header-bound table and the step runs once per row, each row an independently passing or failing example, with no new syntax to learn. (See [Tables](/var/docs/reference/tables/).)

The unit of a Varar spec is an example, not an interaction. Examples are durable. Interactions are not.

## The fourth oath: no ceremony to rot

Cucumber accreted machinery — tags, hooks, a Gherkin AST, `cucumber-messages`, a whole protocol. Every piece is something that has to be learned, configured, and maintained, and machinery left unmaintained is just future flakiness.

Varar leaves it out on purpose:

- **No tags.** Not in v1, by design.
- **No lifecycle hooks in the BDD layer.** Use your test runner's native `beforeEach`/`afterEach` — Varar doesn't reinvent them.
- **No Gherkin AST, no `cucumber-messages`.** The parser emits its own minimal, immutable AST and nothing more.

Underneath, the core is pure functions over immutable data — parsing, matching, planning, snippet generation, diagnostics, all deterministic, all side-effect-free, with file I/O and runner integration pushed out to the adapters. An honest engine for a tool about honesty. The less there is, the less there is to drift.

## The fifth oath: she punishes drift

The original promise of executable specs was that the document couldn't lie, because it ran. That promise was real; teams just couldn't afford to keep it, because the glue that connected prose to code was brittle and maintained by hand.

A Varar spec is a *guide* and a *sensor* at once. It reads like documentation, and it runs like a test. When the documented behaviour and the actual behaviour drift apart, the suite goes red. The lie surfaces immediately, instead of quietly accumulating until the docs are a museum of things that used to be true.

This is the vengeance the goddess takes. You don't want her knocking — so you keep your spec true, and she keeps it true for you.

## Why now: the agent maintains the binding

Everything above answers a *2010s* failure. But the deepest reason Cucumber declined — the brittle, hand-maintained step-definition layer — is answered by something that didn't exist then.

The glue had to be written and rewritten by humans. That was the tax that killed initiatives. Today an agent writes the step definitions, updates them as the system evolves, and explains failures back in business language. The binding layer that used to be the most expensive part of BDD is now the part you delegate.

That flips the value proposition. Under agentic development, the natural-language spec is no longer a reporting veneer bolted onto an implementation — it's the *input* to implementation, and the deterministic counterweight to a non-deterministic agent. [The spec is the contract; the code is regeneratable.](/var/docs/concepts/why-var-with-ai-agents/) You can throw the code away and judge the next attempt against the same examples.

## The oath she demands from you

Varar swears all of the above. In return she asks for exactly one vow, and it is load-bearing:

> **Never edit the spec to make a failing test pass.**

The spec is the contract. When a test goes red, the code is wrong, or your understanding is — and either way the conversation is about the *behaviour*, not about quietly softening the sentence until the suite goes green. The moment you edit the spec to silence it, you've turned your living documentation back into a bunch of lies, and you've broken the one oath the whole tool rests on.

There's a corollary, and it's an old one:

> **Never trust a test you haven't seen fail.**

A spec is only a sensor if it can actually detect drift. A green example that has never once gone red might be proving your behaviour — or it might be wired to nothing, passing for the wrong reason. So watch it fail before you trust it to pass. Break the code on purpose, confirm the example catches you, then fix it. An oath you can't see enforced isn't an oath; it's a wish.

Keep both, and Varar keeps the rest.


