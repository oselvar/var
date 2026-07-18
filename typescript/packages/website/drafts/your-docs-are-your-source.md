---
title: Source code is documentation

description: The human interface for building software is no longer code. It's human language.
area: concepts
order: 1
---

# Source code is documentation

Something has fundamentally shifted. We used to write software like this:

```

(idea)-->[human]-->(code)

```

Now that agents do most of the coding, the human can use *their own* language to build a product.

## Guides and Sensors

A specification is a *guide* (ref TW)

The software will only be good if the specification is good,
so many teams put a lot of effort into them.

A good specification is necessary, but it is not sufficient.
A coding agent also needs a feedback loop - a way to sense if it
is aligned with the goals.

Sensors are often implemented as automated tests, which is great.

### Sensoring guides

What happens to the spec after the agent has finished, rolled over to the side and taken the whole blanket?

Why keep it? It's just dead weight now. Let's extract relevant parts to an ADR and be done with it.

**STOP!** You are sitting on gold here.

With a little bit of effort you can turn your specification into both a *guide* and a *sensor*.
It has now taken on a new life form. It's not dead. It's more un-dead.

It's usually quiet, but wakes up whenever you mess something up.

Like drift between the documentation and the code. You might as well discard it if it's just a bunch of lies.

Varar ensures you have no drift. She is a norse goddess of oaths and agreements.

> Níunda Varar, hon hlýðir á eiða manna ok einkamál, er veita sín á milli konur ok karlar. Því heita þau mál várar. Hon hefnir ok þeim, er brigða.

> The ninth is Varar: she harkens to the oaths and compacts made between men and women; wherefore such covenants are called 'vows.' She also takes vengeance on those who perjure themselves.

You get the picture. You don't want her knocking on your door, trust me.

### Refactoring the spec

You can get an agent to do this. Tell it something along the lines of:

> You are going to update our executable documentation based on the work you just completed.
> Identify relevant parts of the spec, the plan, the code and the unit tests you wrote.
> 
> If you have an example map, use that too. It deeply influences how the documentation is *formulated*.
> If not, imagine one from everything else.
> 
> Write examples that illustrate the business rules that were added or changed.
> An example is a paragraph of texy. Typically 3-4 sentences. 
> They should describe a context, an action and an expected outcome.
> Use concrete names, dates and numbers.
>
> Var will link spans in the text to the business logic of the system.
>
> This helps avoid drift between documented and actual behaviour. 

As you continue to evolve the system, you'll often find that you are modifying existing docs
instead of just creating new ones.

Try to organise them as reference documentation. A place people go to understand what the system does.

Therefore it is important to use precise language.

Assumptions is the mother of all f**kups.