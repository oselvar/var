# Vár sample: Rust + cargo test

A small, standalone sample project that runs Markdown specs as tests with
[Vár](https://var.oselvar.com), driven by `cargo test`. Copy it as the starting
point for your own project.

The `.md` files at the project root are the specs — they run as tests.

## Run it

```sh
cargo test                       # one test per spec, all green
cargo test -- --nocapture        # also prints one line per example (30 total)
cargo test --test specs yahtzee  # run a single spec
```

Each Markdown spec becomes one `cargo test` test; every example in it is run
and printed as `spec.md::name`, mirroring `pytest -v` / `python -m unittest -v`
in the sibling Python samples. (Because var-core is single-threaded — `Rc`, not
`Send` — the samples group examples per spec rather than emitting one libtest
item per example.)

## How it fits together

- **`var.config.json`** is the single source of truth: `docs.include` globs the
  Markdown specs. (`steps` is carried for parity with the other ports; Rust
  compiles its step files in, so there is nothing to glob at runtime.)
- **`src/steps/*.rs`** define the steps. Rust has no import-for-side-effect, so
  — like the Java/Kotlin ports and unlike TypeScript/Python — each file exposes
  a `register(Registry) -> Registry` that adds its steps explicitly, and
  `steps::build_registry` chains them. The threaded state is a **full
  replacement** value (var-core's model): a stimulus returns the whole next
  state; a sensor returns a value for Vár to compare against what the Markdown
  says.
- **`src/*_example.rs`** are the sample's domain code — ordinary modules the
  steps call, just like your production code.
- **`src/runner.rs`** is the small imperative shell (read config, glob specs,
  plan/run each example, render failures). In a full port this would be a
  shared `var-runner` crate; here it lives in the sample to keep it to a single
  crate depending only on `var-core`.

## Notes for the Rust port

- var-core's dynamic `Value` is a **closed enum**, so — unlike the Python/Java
  ports, which hold a `Money`/`date` object in the threaded state — `library`
  encodes money as pennies (`Value::Int`) and a date as a `{year, month, day}`
  map, with `parse`/`format` custom parameter types converting at the edge.
- The `money` parameter type uses a lookahead-free regexp
  (`£\d+(?:\.\d+)?|\d+p`): var-core's matcher compiles with the `regex` crate,
  which has no lookahead, so it drops the empty-match guards of the Python
  pattern (the covered corpus is identical).

## Versioning note

In the [oselvar/var](https://github.com/oselvar/var) monorepo this sample
resolves `var-core` from a `path` dependency, gating trunk against the local
build. A released project would depend on the published crate instead.
