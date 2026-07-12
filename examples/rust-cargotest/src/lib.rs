//! Standalone sample: run Markdown specs as `cargo test` tests with Vár.
//!
//! - the domain modules (`*_example`) are the code under test;
//! - `steps` holds the step definitions plus the registry/context glue.
//!
//! `tests/specs.rs` wires it into `cargo test` via the `var-cargotest`
//! adapter — one libtest item per Markdown example. Discovery, planning,
//! running, rendering, and drift all live in the shared `var-*` crates now, so
//! the sample carries no runner of its own.

pub mod library_example;
pub mod roman_numerals_example;
pub mod steps;
pub mod yahtzee_example;
