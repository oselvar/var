---
title: Why Vár pairs well with AI coding agents
description: ATDD is the deterministic counterweight to non-deterministic AI. The spec is the contract; the code is regeneratable.
area: concepts
order: 1
---

# Why Vár pairs well with AI coding agents

AI coding agents are powerful but non-deterministic. Ask the same agent to implement the same feature twice and you'll get two different implementations — sometimes equivalent, sometimes not. Plain natural-language instructions drift between runs because there is nothing to hold them in place.

Vár specs are the thing that holds them in place.

## The spec is the contract

When you run an agent against a Vár spec, the spec is the contract. The agent's job is to satisfy the executable examples; whatever code it produces is incidental. You can throw the code away, run the agent again, and the result is judged the same way: against the same set of examples. The specs survive across implementations. The code is regeneratable.

This is the same shift that happened when high-level languages took over from assembly. Most of us no longer read the assembler our compilers emit because we've tested the higher-level program and trust the outcome. Generated code from an agent deserves the same treatment — *if* the tests around it are good enough.

> *"The outcome you want to achieve is not part of any reasoning that's deterministic… it stays stable over time. It's part of version control. Even though you experiment with different approaches to how to implement that, it remains the truth."*
>
> — Stefan Ellisdorfer, Smarter Software

## Specs as a fitness function

Once your acceptance criteria are precise enough to execute, an agent can use them as a fitness function. It writes code, runs the Vár suite, reads the failures, iterates. The loop closes itself. You don't have to babysit each diff because the criteria already encode what "done" means.

This is the loop that works:

1. Write the example in plain language as a Vár spec.
2. Hand the spec to the agent.
3. The agent writes step definitions and production code.
4. Vár runs. Failures come back as feedback.
5. The agent iterates until the suite is green.

What used to be a human review loop becomes a test-driven loop the agent runs against itself.

## The discipline pays off twice

Writing executable acceptance criteria takes more discipline than writing prose requirements. That discipline is what makes the criteria useful — but it's also a human skill that pays off independently of AI. Teams that practise BDD-style specification already know how to formulate "what we want" precisely enough for a machine, because they've been doing it for a decade for humans.

> *"What the agents train us to do — being specific and knowing what we want — is something that's also being trained by the ATDD process. If someone is a good ATDD practitioner, or just a person who has a lot of understanding of customer need and is able to formulate this, that's basically the human skill that we all now need to use AI effectively."*
>
> — Christian Gassel, Rohde & Schwarz

A good prompt looks like a good specification. A good specification looks like a good prompt. The two have converged.

## Outer loop, inner loop

The pattern that emerges is double-loop TDD:

- **Outer loop** — Vár specs describe the behaviour the system should exhibit. The agent (or you) writes them with the customer in mind.
- **Inner loop** — the agent works in small steps, writing unit tests and production code together, running them after each step.

The outer loop pins down "are we building the right thing?". The inner loop pins down "are we building the thing right?". Neither alone is enough under agentic development; both together give you something you can trust.

## Where this came from

The framing here is shaped by a conversation between Dave Farley (Continuous Delivery, *Modern Software Engineering* YouTube channel), Stefan Ellisdorfer (Smarter Software, author of *The Effective Software Engineer*), and Christian Gassel (Rohde & Schwarz). They've been using ATDD with agentic assistants to build real systems for real customers. Vár exists to make their workflow easier to adopt without ceremony.
