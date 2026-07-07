# Vár sample: Python + unittest

A small, standalone sample project that runs Markdown specs as tests with
[Vár](https://var.oselvar.com), using the `oselvar-var-unittest` adapter —
nothing but the standard library's test runner. Copy it as the starting
point for your own project.

The `.md` files at the project root are the specs — they run as tests.

## Run it

```sh
uv run python -m unittest
```

Each example in the Markdown specs becomes one unittest test.
[`test_var.py`](test_var.py) is the entire integration — a two-line module
that generates one `TestCase` per spec, which plain `python -m unittest`
(or any unittest-compatible runner) then discovers like hand-written tests.

## How it fits together

- **`var.config.json`** is the single source of truth: `docs.include` globs
  the Markdown specs and `steps` globs the step-definition files.
- **`steps/*.steps.py`** define the steps with `steps` +
  `@stimulus`/`@sensor`. A stimulus returns the next state, a sensor returns
  a value for Vár to compare against what the Markdown says.
- **`src/yahtzee_example/`** is the sample's domain code — an ordinary
  installable package the steps import, just like your production code.

## Versioning note

In the [oselvar/var](https://github.com/oselvar/var) monorepo this sample
resolves the Vár packages from `[tool.uv.sources]` path sources, gating
trunk against the local build. The release sync to
[oselvar/var-examples](https://github.com/oselvar/var-examples) deletes
that table and pins the released PyPI version — there, the plain
`oselvar-var-unittest` dependency is all a real project needs.
