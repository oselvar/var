---
title: Check tables and doc strings
description: Return computed values from a step and let Vár compare them against the Markdown, cell by cell.
---

This guide shows you how to check tabular and multi-line expectations. In Vár a
step may `return` a value; Vár compares it against what the Markdown claims and
anchors any mismatch to the exact cell or character span. There are three
shapes.

## Check a table row by row

Use this when each row of a table is an independent example. Write the table
under a sentence that names its columns:

```markdown
Each row gives an example of a decimal and a roman number:

| decimal | roman |
| ------: | :---- |
|       3 | III   |
|       9 | IX    |
|      40 | XL    |
```

Bind a sensor to that sentence. It receives one row at a time as an object
keyed by the header, and returns the computed columns:

```ts
import { toRoman } from './roman-numerals'

sensor('a decimal and a roman number', (_state, row: { decimal: string; roman: string }) => {
  return { decimal: row.decimal, roman: toRoman(Number(row.decimal)) }
})
```

Each row runs as its own check. If `toRoman(9)` returned `"VIIII"`, only the
`IX` cell fails — with expected and actual, anchored to that cell.

## Check a whole table at once

Use this when the table is one expectation, not a list of independent rows. The
sensor receives the full table as `string[][]` (header row first) and returns
the reproduced table:

```markdown
Uppercase each one:

| before | after |
| ------ | ----- |
| vár    | VÁR   |
| bdd    | BDD   |
```

```ts
sensor('Uppercase each one:', (_state, rows: ReadonlyArray<ReadonlyArray<string>>) => {
  const reproduced = rows
    .slice(1)
    .map(([before]) => ({ before, after: (before ?? '').toUpperCase() }))
  return [reproduced]
})
```

Vár compares every cell of the returned table against the source, as exact
strings.

## Check a doc string

Use this for multi-line text: rendered output, error messages, generated files.
Write the expected text as a fenced code block:

````markdown
Greet Bob:

```text
Hello, Bob!
```
````

The step receives the block's text as a trailing string argument, and returns
the text the software actually produces:

```ts
sensor('Greet {word}:', (_state, name, _body: string) => {
  return [name, `Hello, ${name}!\n`]
})
```

The comparison is exact equality, **including the trailing newline**. The
returned tuple carries the step's captured arguments plus the text — here
`[name, text]`.

## How failures are reported

- A differing table cell fails with a `CellMismatchError`: each wrong cell gets
  its own `expected` / `actual`, anchored to the cell's source span — editors
  redden exactly the failing characters.
- A differing doc string fails with a `DocStringMismatchError`.
- Returning a value of the wrong shape is a `ReturnShapeError`.
- Returning `undefined` means "no assertion" — the step passes.
