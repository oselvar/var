# Varar sample: Rust + cargo test

A small, standalone sample project that runs Markdown specs as tests with
[Varar](https://varar.dev), driven by `cargo test`. Copy it as the starting
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
in the sibling Python samples. (Because varar-core is single-threaded — `Rc`, not
`Send` — the samples group examples per spec rather than emitting one libtest
item per example.)

## How it fits together

- **`varar.config.json`** is the single source of truth: `docs.include` globs the
  Markdown specs. (`steps` is carried for parity with the other ports; Rust
  compiles its step files in, so there is nothing to glob at runtime.)
- **`src/steps/*.steps.rs`** define the steps. Rust has no
  import-for-side-effect, so — like the Java/Kotlin/Go/C# ports and unlike
  TypeScript/Python — each file exposes a `register(s: &mut Steps<Ctx>)` that
  adds its steps to the injected builder, and `steps::build_registry` threads one
  builder through them all. The threaded state is a **full replacement** value
  (varar-core's model): a stimulus returns the whole next state; a sensor returns
  a value for Varar to compare against what the Markdown says.
- **`src/library.rs`**, **`src/roman_numerals.rs`** and **`src/yahtzee.rs`** are
  the sample's domain code — ordinary modules the steps call, just like your
  production code.
- **`tests/specs.rs`** is the whole imperative shell: it hands the project root,
  the registry and the context factory to `varar-cargotest`. Discovery, planning,
  running, rendering and drift all live in the shared `varar-*` crates, so the
  sample carries no runner of its own.

## Notes for the Rust port

- The `library` sample keeps its domain types — `chrono::NaiveDate` and a
  `Money` — in the code under test, and does all parsing and formatting of the
  document's notation in the custom parameter types (`src/steps/library.steps.rs`),
  exactly like the TypeScript reference. A slot has to survive a round trip
  through varar-core's `Value`, so each domain type implements `ToSlot`/`FromSlot`
  once; `NaiveDate` needs a thin newtype for it, because both the type and the
  trait are foreign to this crate.
- The `money` parameter type uses a lookahead-free regexp
  (`£\d+(?:\.\d+)?|\d+p`): varar-core's matcher compiles with the `regex` crate,
  which has no lookahead, so it drops the empty-match guards of the TypeScript
  pattern (the covered corpus is identical).

## Versioning note

In the [varar-dev/varar](https://github.com/varar-dev/varar) monorepo this sample
resolves `varar-core` from a `path` dependency, gating trunk against the local
build. A released project would depend on the published crate instead.
