# Tables and doc strings

A whole table is handed to a step all at once — the step returns the computed
table, and Vár checks every cell.

Uppercase each one:

| before | after |
| ------ | ----- |
| vár    | VÁR   |
| bdd    | BDD   |

A doc string is handed to a step as text — the step returns the text it should
produce, and Vár checks it exactly.

Greet Bob:

```text
Hello, Bob!
```
