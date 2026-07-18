I am the creator of Cucumber. I created it in 2008. For 10 years it was my main endeavour. I'm one of the leading experts in BDD in the world.

But I stopped using Cucumber around 2020 - for two reasons.

1) I find Gherkin to restrictive
2) I find the tooling (cucumber-js) to have fallen behind

Today I am using coding agents a lot. I want to start using Cucumber
again, because I think it would be helpful to bridge the communication gap
between agents and developers (and the business).

What I like about Cucumber:

- Cucumber Expressions
- Tag Expressions
- Step Definitions
- Tables and DocStrings

What I don't like about Cucumber

- The cucumber-js runner (no vitest integration)
- Gherkin
- Scenario Outlines
- Backgrounds
- Cucumber Messages - so over engineered

I did implement an experimental Markdown syntax for Gherkin, and it's in
cucumber-js, but it's brittle. It maps onto the Gherkin AST, which limits it.

I also wrote the official Cucumber extension for VSCode. It's feature set is
great, but the implementation is not - it's very slow and brittle, and it
takes ages to parse the step definitions to update the autocomplete.

## A new start

I want to start fresh. This time in Markdown, but without the Gherkin baggage.
I don't want any restrictions about how the author writes the Gherkin.

They should just write markdown the way it feels right. 
No need for bullets, Given, When, Then etc.

The challenge is:

- Where does an example start?
- How do we identify steps?
- What's the authoring/running/results UX like? It should be delightful

What I have in mind is a smart "parser" that just finds text in the markdown
that matches step definitions. It finds steps, data tables and doc strings using
very simple conventions. There isn't much syntax to learn.

And if you open it in VSCode with the (new) plugin, you get highlighting of
matched stepdefs, autocomplete, the works.

## Tech

We should base this on the existing libraries for cucumber expressions and tag expressions. We should not invent a new runner but bolt onto vitest.
There should be an adapter layer so it can be bolted onto other runners too.

## Results

Results can just go in the terminal - we don't need to generate fancy reports.
Maybe (just maybe) we'd create a markdown renderer that can also consume a results file and colour things.

## Dog food

As we develop this new tool, we should dog food - testing with our own tool.

We should start by writing some markdown files that describe how the tool works.
It should also work as nicely readable, terse (very terse) documentation
using inspiration from https://diataxis.fr/

## Name

We'll call the tool Varar (@varar/varar). It's a tongue in cheek because clueless Cucumber adopters would often call the examples or feature files "BDDs". I've written lots of BDDs, which is a sign they didn't quitre get the concept. So we pick this ironic name since it's fun.

## Speed

It has to be fast. Very very fast. Sub second feedback is essential
in the age of coding agents because they need to verify all the time.