# Python implementation

uv workspace for the Python port of `var` (ADR 0001, issue #2). A native,
pure-Python port of the reference TypeScript implementation that passes the same
cross-language conformance suite.

```sh
uv sync          # create .venv, install workspace members + dev deps
uv run pytest    # run the test suite (core + runner + plugin + conformance)
uv run ruff check
```

## Packages

| Package (dist / import) | Layer |
|---|---|
| `oselvar-var-core` / `var_core` | pure functional core: parse → plan → execute, matcher, diffs, conformance |
| `oselvar-var` / `var` | author facade: `define_state` (+ `internal`, `registry` glue) |
| `oselvar-var-config` / `var_config` | reads `var.config.json` — the shared config file for all var tools |
| `oselvar-var-runner` / `var_runner` | shared imperative shell: discovery, step loading, run orchestration, failure rendering |
| `pytest-var` / `var_pytest` | pytest plugin: `.md` specs as first-class tests |
| `oselvar-var-unittest` / `var_unittest` | unittest adapter (skeleton) |

## Run Markdown specs as live var tests (dogfood)

The `pytest-var` plugin turns a `.md` file into pytest tests (one item per
example). `var.config.json` points it at a **collision-free
subset** of the shared `conformance/bundles/` (the bundles reuse some
expressions across bundles — e.g. `I echo…`, `I have {int} cukes`,
`I greet {string}` — and the plugin builds one global step registry, so it can't
load them all at once):

```sh
cd python
uv run pytest --rootdir=. ../conformance/bundles
# → 5 passed, 2 failed
#   07-row-check-mismatch and 09-expected-message-mismatch FAIL by design,
#   so you see var failing immediately, anchored to the .md:
#
#   Cell mismatch in .../07-row-check-mismatch/example.md:
#     line 9 | column 'score' — expected: '10', actual: '99'
```

**Want to edit a spec/step and watch it flip?** Do NOT edit files under
`conformance/bundles/` — they are the shared golden corpus, and changing them
breaks the conformance suite (Python *and* TypeScript). Instead, copy a bundle to
a scratch location you own, point `var.config.json` at it, and edit freely:

```sh
cp -r ../conformance/bundles/01-roman-numerals /tmp/myspec
# add "/tmp/myspec/*.md" to var.config.json's docs.include and
# "/tmp/myspec/*.steps.py" to steps
uv run pytest --rootdir=. /tmp/myspec        # green
# now change a number in /tmp/myspec/example.md or break a handler → red
```

(The default `uv run pytest` runs only the package test suite — `testpaths =
["packages"]` — so the dogfood bundles are opt-in via the explicit path above.)
