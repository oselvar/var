//! `var-core` — the pure functional core of var, ported from the Java module
//! `com.oselvar.var.core`: parse → match → plan → execute, diffs, drift/hash,
//! canonical JSON, and the conformance projections. No filesystem, network,
//! time, or test-framework dependencies.
//!
//! The sealed Java interfaces (`Block`, `TableOrFence`, `ResolvedSteps`) become
//! Rust enums; the exception hierarchy becomes [`error::StepError`]/`Result`;
//! `Object` duck-typing becomes [`value::Value`]; reflective handler invocation
//! becomes boxed closures ([`handler::Handler`]).

#![forbid(unsafe_code)]
// `StepFailure` carries the full diff payload the tests consume by value
// (`run().unwrap_err().error`); boxing it would change that public surface.
#![allow(clippy::result_large_err)]
// Nested `if`/`if let` blocks mirror the Java control flow faithfully; stable
// Rust has no `let`-chains to collapse the `if let` cases into.
#![allow(clippy::collapsible_if)]
// Declared exception to "no globals in the core": `execute::install_hook`
// registers a Once-guarded, thread-local-gated process panic hook — the only
// way to silence stderr for the panics `catch_unwind` deliberately catches
// (the AssertionError parity channel). See its doc comment for the guarantees.

pub mod ast;
pub mod canonical_json;
pub mod cell_diff;
pub mod conformance;
pub mod diagnostics;
pub mod doc_string_diff;
pub mod drift;
pub mod error;
pub mod execute;
pub mod expression;
pub mod failure;
mod failure_anchor;
pub mod handler;
pub mod hash;
pub mod matcher;
pub mod offsets;
pub mod param_diff;
pub mod parse;
pub mod plan;
pub mod registry;
pub mod result;
pub mod scanner;
pub mod sentences;
pub mod span;
pub mod step_kind;
pub mod step_role;
pub mod structurer;
pub mod table_cells;
pub mod value;
