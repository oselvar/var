//! Standalone sample: run Markdown specs as `cargo test` tests with Varar.
//!
//! - the domain modules (`library`, `roman_numerals`, `yahtzee`) are the code
//!   under test;
//! - `steps` holds the step definitions plus the registry/context glue.
//!
//! `tests/specs.rs` wires it into `cargo test` via the `varar-cargotest`
//! adapter — one libtest item per Markdown example. Discovery, planning,
//! running, rendering, and drift all live in the shared `var-*` crates now, so
//! the sample carries no runner of its own.

pub mod library;
pub mod roman_numerals;
pub mod steps;
pub mod yahtzee;
