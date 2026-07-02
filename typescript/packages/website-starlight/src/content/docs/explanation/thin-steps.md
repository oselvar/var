---
title: Thin steps
description: Let the steps guide your software design
---

The recommended way to work with Vár is to write the vardoc *first* and let it *guide* the
implementation of the software design.

The vardoc is the result of a *conversation* between people and/or agents. 
It captures the language of the *problem domain* using words like *refund*, *reservation*, *location*
etc.

The body of your step definitions should ideally only be **2-3** lines of code, and delegate
to a *port* for your domain logic.