---
title: Vár
description: Vár overview.
---

Vár is an I/O layer that sits between your documentation and your software.
It connects the two with *cells* (like spreadsheet cells).

A cell can be a number, date, name etc. It can be in a paragraph of text, or in a table.

Paragraph cells are identified by *step functions*, which are functions accompanied by an expression that selects text in your document.
Table cells are identified by markdown tables in your document.

There are two kinds of cells - input and output.

# Input cells 

An input cell is like a spreadsheet cell *without* a formula.
Its value is passed to a *stimulus* step function that modifies the state of the system.

# Output cells

An output cell is like a spreadsheet cell *with* a formula.
Its value is *compared* to the return value of a *sensor* step function.
If those values are different, it's an error. The document and the system disagree.
