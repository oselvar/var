Thoughts on day 1 of development

# Skipan

Today I'm proud to release *Skipan* - a tool that runs automated tests written in Markdown.

Here is an example:

```md
Maya has borrowed The Left Hand of Darkness, due back on March 12th. When she returns it on March 19th, 
the library charges her a £3.50 late fee — 50p for each day overdue. 
Her account shows the fee, and she can't borrow anything else.
```

This might not look like a test to you, but it actually is.
It's also an *example* that illustrates one or more *business rule* for a library:

* Late returns incur a fee of 50p per day overdue.
* Members with unpaid fees cannot borrow.

## Assumptions

The typical way to communicate requirements to people or coding agents is to mention these rules.
But rules are often ambiguous and vague.

Concrete examples (like the one about Maya above) illustrate the rules.
And they can be run as test. Rules can't be run as tests, unless you use a logic language, which very few people do.

## When and where

Coding agents love markdown. They come in many flavours. So where does Skipan markdown live?
When is it written? Are they ephemeral?

Skipan docs are permanent. They serve two purposes - specification, documentation and automated tests.
But unlike *code* tests, they are readable by humans.

Sure, an agent can read code tests too, and figure out how your system works (or should work),
but this takes a lot more effort than just reading prose. With code, it has to piece everything
together and make lots of inference. This consumes a lot of tokens.

Perhaps the most important benefit is that a human can quickly see *how the system works today*,
or *how it's supposed to work soon* (if the code hasn't been written yet).

So it goes through several phases in its life. Spec -> Test -> Doc.

## Why not Cucumber?

- stilted language
- poor dx
- outdated
- ossified (team not open to agentic coding)

-------

Thoughts on day 2 of development...

How do you know that the coding agent has implemented your instructions correctly?
100% passing tests can still be wrong.

It may have interpreted your specification differently from you.

Both you and the agent need to agree on what correct means, and this must be verifiable.
That's what Skipan gives you - an *executable* specification.

If you change the specification after it's done, we want to have an *error* so the agent can fix it.