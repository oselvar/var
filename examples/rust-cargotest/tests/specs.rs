//! Runs every Markdown spec matched by `var.config.json` as `cargo test` tests
//! — one libtest item per example — through the `var-cargotest` adapter.
//!
//! `cargo test` reports each as `spec.md::name`; `cargo test <substring>`
//! selects, `--list` enumerates. Set `VAR_UPDATE=1` to accept drift.

use std::path::Path;

fn main() {
    var_cargotest::run(
        Path::new(env!("CARGO_MANIFEST_DIR")),
        example::steps::build_registry,
        example::steps::context_value,
    );
}
