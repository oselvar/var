---
title: The decline of BDD and Cucumber
description: In the 2010s, executable specifications were going to change how software was built. They didn't. Here's what actually happened — and why the idea is coming back.
area: concepts
order: 2
---

# The decline of BDD and Cucumber

For a few years in the early 2010s, a lot of us genuinely believed executable specifications would become the dominant way software requirements were expressed.

The pitch was irresistible. Business people write examples. Developers automate them. The examples become living documentation. Everyone shares one understanding, and the suite *proves* what the system does — in language a non-technical person can read and verify.

It was a real idea, solving a real problem. It just turned out not to be a universal one. Today BDD and Cucumber aren't dead, but they're fringe. Worth understanding why, because the reasons are coming undone.

## The thing that died was the artifact

It's important to be precise about *what* declined. The idea — that concrete examples are an excellent way to discover and pin down requirements — survived just fine. What didn't survive was a specific artifact: the belief that a single Gherkin document could be *simultaneously* a business-readable specification and an executable test, maintained jointly by business and developers forever.

That promise mostly didn't survive contact with how teams actually work. Here's roughly how it came apart, in order of damage done.

## The collaboration premise rarely held

The entire justification for the prose layer was that non-technical stakeholders would read, verify, even co-author scenarios.

In most teams, that's not what happened. Developers wrote all the Gherkin. The business never opened the `.feature` files. People happily collaborated on examples *during a workshop* — but few stakeholders wanted to maintain example files in a Git repository afterwards. They preferred Figma prototypes, spreadsheets, Jira tickets, product docs, interactive demos.

So teams paid the indirection cost — the step-definition glue, the expression matching, the English-to-code mapping — without collecting the shared-understanding benefit. And once the business isn't reading it, a feature file is strictly *more* expensive than the equivalent test written in code.

## Gherkin became test code in disguise

The classic decay. Teams started here:

```gherkin
Scenario: Customer buys shares
  Given the customer owns no shares
  When they purchase 10 shares
  Then they should own 10 shares
```

and ended here:

```gherkin
Given I click the login button
And I enter "bob@example.com"
And I wait 3 seconds
Then the modal appears
```

Feature files quietly turned into another UI-testing DSL. Business people stopped reading them — there was nothing business-readable left to read. Developers found them harder to maintain than ordinary tests. At which point the only honest question is: *why not just write code?* And many organisations answered: we should.

## The tests ended up slow, flaky, and expensive

Executable specifications occupy an awkward layer in the test pyramid. Unit tests are cheap, fast, precise. UI tests are expensive, flaky, slow. Most BDD acceptance suites — typically wired to the browser through Selenium — ended up sitting right next to the UI.

Organisations accumulated thousands of scenarios and then discovered the bill: runs that take hours, failures that are brittle, a reworded sentence that breaks a test, maintenance costs that never stop. Cucumber got blamed for the flakiness, and "BDD" came to mean "the slow, brittle test layer" in a lot of people's heads — roughly the opposite of the original pitch.

## The ecosystem routed around it

Meanwhile the tooling underneath got good enough that the marginal readability of Gherkin stopped justifying the seam.

```ts
test('user can check out', async () => { /* ... */ })
```

in Playwright, with user-centric locators, reads well enough, runs fast, and has no English-to-code mapping to maintain. Testing Library, Vitest, table-driven `it.each` cases — those quietly absorbed most of what people actually used Gherkin for.

And the chasm BDD was built to bridge narrowed on its own. Its sweet spot was big organisations with a real gulf between business analysts and developers. Cross-functional product teams, more technical PMs, and full-stack engineers shrank that gulf, so the coordinating ritual had less to do.

## What replaced it — nothing, and that's the story

There was no single successor. The idea fragmented, and each slice got a specialised owner:

| What BDD promised            | Where it went                              |
| ---------------------------- | ------------------------------------------ |
| "Prove the integration"      | Contract testing (Pact)                    |
| "Prove the shape"            | Type systems, Zod, OpenAPI                 |
| "Examples, exhaustively"     | Property-based testing (fast-check)        |
| "Living UI documentation"    | Storybook                                  |
| "Validate the behaviour"     | Telemetry, A/B tests, funnels, dashboards  |
| "Discover requirements"      | Example Mapping, Event Storming, DDD       |

Product development shifted from *"this behaviour is specified upfront"* to *"which behaviour performs best?"* Evidence moved from passing scenarios to production data. Continuous delivery shifted trust toward alerts, traces, and canary releases rather than enormous acceptance suites.

And the most valuable part of BDD — the *conversation*, the discovery workshop, the concrete example, the shared vocabulary — survived as a discipline. It just never got a tool. It moved to tickets, PRDs, Figma, and Slack. Teams kept doing Example Mapping and stopped before automation.

## The wrinkle: the premise is coming back

The step-definition layer existed for one reason: *something* had to bind prose to code. Humans maintaining that binding by hand was the brittle part — the part that killed most initiatives.

Large language models change that economics completely. A model can generate scenarios from prose, update examples as APIs evolve, write and rewrite the glue, and explain a failure in business language. The maintenance burden that sank BDD in 2012 is exactly the kind of work agents are good at in 2026.

That suggests a different shape than 2010s Cucumber ever had:

```
conversation → examples → executable spec → tests → documentation
```

with the agent doing the binding, and the natural-language spec serving as the *input* to implementation rather than a reporting veneer bolted onto Selenium. That's a meaningfully different value proposition. It's also [why Varar exists](/var/docs/concepts/the-oaths-of-var/).
