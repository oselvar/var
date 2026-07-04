# Concepts article series — "the one idea behind the darlings"

Date: 2026-07-01
Status: design, pending implementation

A four-article series for the website `concepts/` area that revisits several
"darlings of experienced engineers" — hexagonal architecture, dependency
injection, value objects, immutability, pure functions, functional core /
imperative shell — argues they are riffs on one idea (separate I/O from business
logic → testability, decoupling, maintainability), shows why that idea just
became *existential* because of agentic development (speed = fast feedback = only
possible when decoupled), and lands on Vár's positioning: an **acceptance**-testing
framework that validates **business rules, not the user interface**, pluggable at
any level.

## Start here (read this first if resuming cold)

If you are picking this up in a fresh session with no prior context, read these
before writing a word:

1. **Voice & format** — read all of `typescript/packages/website/src/content/docs/concepts/*.md*`,
   especially `the-decline-of-bdd-and-cucumber.md`, `your-docs-are-your-source.md`,
   `the-oaths-of-var.md`. Match their register exactly: confident, opinionated,
   historically/architecturally grounded, problem-first; `##` headers that are
   themselves mini-arguments; short code blocks and the occasional 2-column
   table; every piece ends in a forward link. No hedging, no marketing fluff.
2. **The technical backing for article #4** — read the "Ports & injection" section
   of `doc/superpowers/specs/2026-06-30-cross-implementation-consistency-design.md`.
   That is the concrete truth behind #4's "test at any level" claim: Vár's pure
   core receives only **injected data + port callbacks** (a `sink`, a `reporter`,
   `createContext`); an "adapter" is *just* those port implementations, so a
   caller can inject data and read results (the browser does this — no runner) or
   wire a full-stack driver — same business rules, different adapter.
3. **Existing reference page to link to** — `.../reference/examples-and-drift.mdx`.

**The thesis, in three sentences.** Hexagonal architecture, dependency injection,
functional core / imperative shell, pure functions, immutability, and value
objects are not six separate best-practices — they are dialects of one sentence:
*keep I/O at the edges and keep the core pure*, which buys testability,
decoupling, and maintainability. That was optional "hygiene" for decades;
agentic development makes it existential, because an agent's loop is only as fast
as its feedback, and fast feedback is only possible when the business logic is
decoupled from I/O. Vár is where that lands: an **acceptance**-testing framework
that validates **business rules, not the user interface**, and — because the core
is injected — plugs in at *any* level.

**Author's stakes (write to this bar).** This series is a large part of the
author's software philosophy; the author believes Vár could become as significant
as Cucumber once was. Write it as the definitive, quotable statement of that
philosophy — essays a senior engineer forwards to their team — not as product
copy.

## Why (author's intent)

This is a large part of the author's software philosophy, and the belief is that
Vár could be "as big as Cucumber once was." The series must land the philosophy,
not just describe a tool. It runs on a different axis from the existing concepts
pages (which cover the BDD history + collaboration angle): this is the
*engineering-architecture* angle.

## Form (non-negotiable)

- **Multiple articles, each anchored on a recognizable problem** developers and
  product teams actually have. Each offers *part* of the solution + a
  **cliffhanger**, with a **segue** into the next.
- **Voice matches the existing `concepts/` pages** — confident, opinionated,
  historically/architecturally grounded, problem-first; tables and short code
  blocks; each piece ends in a forward link. Models to match:
  `the-decline-of-bdd-and-cucumber.md`, `your-docs-are-your-source.md`,
  `the-oaths-of-var.md`.
- **Frontmatter** per page: `title`, `description` (punchy, ~1–2 sentences),
  `area: concepts`, `order`. Assign `order: 4, 5, 6, 7` so the four read as a
  sequence after the current concepts pages (orders 1–3).
- Astro/MDX-safe Markdown (these are `.md`; the website `pnpm --filter
  @oselvar/website build` must pass). Internal links use the site's
  `/var/docs/concepts/<slug>/` form (see existing pages).

## The four articles

### 1. `why-are-your-tests-slow.md` — "Why are your tests slow?"
`order: 4`
`description:` "Slow, flaky test suites aren't a testing problem — they're an architecture problem. And the fix is older and simpler than you think."

- **Problem (the hook):** the suite that takes minutes-to-hours; the flaky-test
  quarantine; mock sprawl; the guilt of an inverted test pyramid.
- **Beats:** teams treat symptoms — more parallelism, more mocks, retrying flakes,
  splitting CI. The real cause: business logic is tangled with I/O, so *every*
  test has to boot the world (browser, DB, network, clock). Cost compounds;
  trust erodes.
- **Cliffhanger / segue:** a handful of famous patterns already solved this — you
  just never noticed they were the *same* solution. → links to #2.

### 2. `five-patterns-one-idea.md` — "Five patterns, one idea"
`order: 5`
`description:` "Hexagonal, dependency injection, functional core / imperative shell, immutability, value objects — experienced engineers hoard them as separate darlings. They're dialects of one sentence."

- **Problem:** too many overlapping patterns, each with its own priesthood; which
  do I follow, and how do they relate?
- **Beats:** name the darlings; show each reduces to *keep I/O at the edges, keep
  the core pure*. The **filesystem worked example**: model file access as an
  injected `readFiles` **port** (hexagonal) OR as an injected **file value
  object** — and note the nuance the author raised: injecting a *function
  parameter* (not a constructor/factory dependency) isn't strictly classic
  Dependency Injection, yet buys the same decoupling. Immutability + pure
  functions = the core's discipline (same input → same output, no hidden I/O);
  value objects = data you can trust. **The missing link:** they all purchase
  the same three things — testability, decoupling, maintainability — by the same
  move (I/O out, logic pure).
- **Cliffhanger / segue:** this was optional "good hygiene" for decades. Something
  just made it non-optional. → links to #3.

### 3. `agents-made-it-urgent.md` — "Agents made it urgent"
`order: 6`
`description:` "For decades, separating I/O from logic was hygiene you could skip. Agentic development turned it into the difference between a fast loop and no loop at all."

- **Problem:** the AI/agent development loop is slow; the agent stalls waiting on
  slow tests; feedback is the bottleneck.
- **Beats:** agents iterate fast but need a *verdict* fast; if the verdict
  requires booting the world, the loop collapses. A pure core is testable in
  milliseconds, thousands of times, while the agent works. Decoupling *is* the
  agent's fast feedback — so the old darlings flip from optional hygiene to the
  superpower (or, un-applied, the thing that makes agentic dev unbearable).
- **Cliffhanger / segue:** fast feedback on *what*, exactly? Not units (too
  small to prove the feature is right), not the UI (too slow, too coupled). There
  is a neglected level in between. → links to #4.

### 4. `testing-that-your-software-is-acceptable.md` — "Testing that your software is acceptable"
`order: 7`
`description:` "Vár isn't a full-stack testing framework or a unit-testing framework. It's an acceptance-testing framework — it checks that software is acceptable by validating business rules, not the user interface."

- **Problem:** unit tests pass but the feature is wrong; end-to-end tests are slow
  and flaky (back to article #1); "is it *acceptable*?" is the real question and
  nothing tests it well.
- **Beats:** acceptance = does it satisfy the **business rules** / is it acceptable
  to the stakeholder — explicitly **not the UI**. Because a well-decoupled core
  takes injected **data + port callbacks**, the adapter is thin and you can plug
  in at *any* level: unit-fast against the domain, or full-stack through a driver
  — same business rules, different adapter. Vár = business rules in Markdown +
  adapters at any level: the acceptance layer the test pyramid forgot.
- **Payoff (terminal — CTA not cliffhanger):** link out to
  [The oaths of Vár](/var/docs/concepts/the-oaths-of-var/),
  [Sensors and Actuators](/var/docs/concepts/sensors-and-actuators/), and the
  reference page [Examples and drift](/var/docs/reference/examples-and-drift/).

## Cross-link map

Forward arc: 1 → 2 → 3 → 4. Article 4 links out to `the-oaths-of-var`,
`sensors-and-actuators`, `examples-and-drift`. Where natural, #3/#4 may link back
to `why-var-with-ai-agents` (agentic angle) — but do not force it.

## What this series must NOT do

- Not re-tell the BDD/Cucumber history (that's `the-decline-of-bdd-and-cucumber`);
  reference it, don't repeat it.
- Not become a Vár tutorial — these are concept essays. Vár enters as the *answer*
  in #4, not as a feature list.
- Not overclaim: acknowledge unit and e2e tests have their place; the argument is
  about the *missing middle* (acceptance of business rules) and the *architecture*
  that makes it fast.

## Testing / done

Each article is a committed `.md` under
`typescript/packages/website/src/content/docs/concepts/` with valid frontmatter,
and `pnpm --filter @oselvar/website build` passes (the page renders; internal
links resolve). The four read as a coherent, cliffhanger-linked arc in the
concepts nav.

## References

- Existing concepts pages (voice + arc): `typescript/packages/website/src/content/docs/concepts/*`
- The reference page this session added: `.../reference/examples-and-drift.mdx`
- The architecture this philosophy is embodied in: the cross-implementation
  consistency design (`2026-06-30-cross-implementation-consistency-design.md`) —
  esp. its "Ports & injection" section (core takes data + port callbacks; adapters
  are thin), which is the concrete backing for article #4's "any level" claim.
