# Vár sample: Python + pytest

A small, standalone sample project that runs Markdown specs as tests with
[Vár](https://var.oselvar.com), using the `pytest-var` plugin. Copy it as the
starting point for your own project.

> **Note:** the Vár Python packages are not on PyPI yet, so this sample
> resolves them from the sibling workspace via `[tool.uv.sources]` path
> entries in `pyproject.toml`. Once they're published, delete that table —
> the plain `pytest-var` dependency is all a real project needs.

## Run it

```sh
uv run pytest
```

Each example in the Markdown specs becomes one pytest test. No conftest.py
and no test files are needed — installing `pytest-var` is the entire
integration.

## How it fits together

- **`var.config.json`** is the single source of truth: `docs.include` globs
  the Markdown specs (here they live outside the project, in the repo's
  shared [`doc/examples/`](../../doc/examples) corpus — in your project they
  can sit anywhere), and `steps` globs the step-definition files.
- **`steps/*.steps.py`** define the steps with `define_state` +
  `@stimulus`/`@sensor`. A stimulus returns the next state, a sensor returns
  a value for Vár to compare against what the Markdown says.
- **`src/yahtzee_example/`** is the sample's domain code — an ordinary
  installable package the steps import, just like your production code.
- The specs sit outside the pytest rootdir, so `pyproject.toml` points
  pytest at them (`testpaths = ["../../doc/examples"]`, `--rootdir=.` keeps
  `var.config.json` discovery anchored to this project).
