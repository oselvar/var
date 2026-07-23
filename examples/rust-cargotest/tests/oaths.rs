//! Runs every Markdown spec matched by `varar.config.json` as `cargo test` tests
//! — one libtest item per example — through the `varar-cargotest` adapter.
//!
//! `cargo test` reports each as `spec.md::name`; `cargo test <substring>`
//! selects, `--list` enumerates. Set `VARAR_UPDATE=1` to accept drift.

use std::path::Path;

fn main() {
    varar_cargotest::run(
        Path::new(env!("CARGO_MANIFEST_DIR")),
        example::steps::build_registry,
        example::steps::context_value,
    );
}
