---
title: Sensors and Actuators
description: The key concepts of executable documentation
area: concepts
order: 2
---

# Sensors and Actuators

[Birgitta Böckeler](https://martinfowler.com/articles/harness-engineering.html) says:

> Guides (feedforward controls) - anticipate the agent's behaviour and aim to steer it before it acts. 
> Guides increase the probability that the agent creates good results in the first attempt
>
> Sensors (feedback controls) - observe after the agent acts and help it self-correct. 
> Particularly powerful when they produce signals that are optimised for LLM consumption, e.g. custom linter 
> messages that include instructions for the self-correction - a positive kind of prompt injection.

With Varar, the markdown document is both the guide and the sensor.

The guide aspect happens outside of Varar - that's just the agent reading the markdown document and
using it to *guide* or *steer* its activities.

The sensor aspect happens when Varar runs the markdown as an automated acceptance test.
The sensor is implemented as an *assertion* - a comparison between an expected value (in the markdown)
and an actual value (from the software). Like a good physical sensor, a good assertion is read-only:
it observes the software without disturbing it.

A good automated test has two more elements in addition to the assertion:

* An *action* (or an *actuator*)
* A *context* (or a *quiescent state*)

There are many ways to write this in human language, but typically it's in this order:

* context
* action
* expected outcome

It helps to understand why each element is named the way it is.

The action is the *actuator* - the single stimulus you put the software through. Just as an actuator
drives a circuit, the action drives the software. Keep it to one thing: that one behaviour is what the
test is about.

The context is the *quiescent state* - the resting state the software sits in before the action arrives.
*Quiescent* means at rest. The action swings around it, and the outcome is read relative to it. Note that
the context describes how the world *is*, not the actions that produced it: "a logged-in user" is a state,
even though logging in was an action. Write your context as states, not as a replay of earlier steps.

Action and outcome are *events* - things that happen. Context is a *state* - how the world is. So when you
can't decide whether something belongs in the context or the action, the question is epistemic: the context
is what you hold fixed and trust; the action is the one thing you interrogate. The same step can sit on
either side, and which side you choose decides what the test is really about.

The expected outcome is the reference the sensor's signal is compared against. The result of that comparison
is the signal back to the agent. It's either success, failure or error. Failure means the signal was
different than expected. An error means the software threw an exception.