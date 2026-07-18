---
title: Thin steps
description: Let the steps guide your software design
---

The recommended way to work with Varar is to write the documentation *first* and let it *guide* the
implementation of the software design.

The documentation is the result of a *conversation* between people and/or agents. 
It captures the language of the *problem domain* using words like *refund*, *reservation*, *location*
etc.

The body of your step definitions should ideally only be **2-3** lines of code, and delegate
to a your domain logic.

## TODO

* A diagram that shows a step definition *and* an imperative shell invoking a functional core (part of the system).
* A concrete example.