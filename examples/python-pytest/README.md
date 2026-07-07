# Vár sample: Python + pytest

A small, standalone sample project that runs Markdown specs as tests with
[Vár](https://var.oselvar.com), using the `pytest-var` plugin. Copy it as the
starting point for your own project.

The `.md` files at the project root are the specs — they run as tests.

## Run it

```sh
uv run pytest
```

Each example in the Markdown specs becomes one pytest test. No conftest.py
and no test files are needed — installing `pytest-var` is the entire
integration.

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
`pytest-var` dependency is all a real project needs.
