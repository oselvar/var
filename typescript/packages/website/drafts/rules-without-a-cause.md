---
title: Rules without a cause
description: A rule you can't trace back to an example is just a vibe with a clipboard.
pubDate: 2026-06-24
---

Rules without a cause.

Rules without a cause are arbitrary. They invite rebellion or confusion.

This manifests in software. When the domain is new and requirements are vague or ambiguous,
you will always get useless software. Useless in the sense that it doesn't solve the users' problems.



We love rules. *Always write the test first. Never push to main. Every step must
start with Given, When, or Then.* Rules are comforting — cheap to state, easy to
enforce, and they make us feel like grown-ups who have it together.

But a rule without a cause is cargo cult. Somewhere upstream of every good rule
there was a **concrete thing** — a bug that bit, a feature someone misunderstood,
a 2 a.m. deploy that went sideways. The rule is the scar tissue. The cause is the
wound. And when teams keep the scar but forget the wound, the rule hardens into
ceremony: followed because it's followed, defended because it's written down.

Varar is built on the opposite move. The artifact isn't the rule — it's the
**example**:

> First I greet "world". The greeting should be "Hello, world!"

That sentence is the cause. It's a thing you wanted to be true, written the way
you'd say it to a colleague. The step definition behind it — the "rule" — exists
only to make the example *runnable*. Change your mind about the behaviour and the
example changes; the rule follows. The example is in charge.

This is why we don't ship a `Given`/`When`/`Then` police force. Those keywords are
narration — they help you *read* an example, not match it. A rule that polices the
shape of your prose is a rule that lost its cause somewhere around the third
retro.

It's also why Varar only ever reports **presence**, never absence. We can tell you a
sentence *matches* a step — that's a fact, grounded in an example you wrote. We
can't tell you a step is *missing*, because "missing" isn't something you can
observe; it's something you'd have to assume. A diagnostic that flags absence is a
rule without a cause: confident, tidy, and quietly making things up.

So the next time a rule shows up on your team, ask it the rude question: *what's
your cause?* If it can point at an example — great, keep it, automate it, let the
example carry it. If it can only point at itself, it's a rebel without one. Those
are the rules that make people cry.

Write the example. Let it hold the shape of the thing. The rules will sort
themselves out.
