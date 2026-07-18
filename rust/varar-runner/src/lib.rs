//! `varar-runner` — the imperative shell shared by var test-runner adapters.
//!
//! Spec discovery (the shared glob semantics), planning/running examples,
//! failure rendering, and the filesystem `var.lock.json` baseline store for
//! drift. Contains no pipeline logic — it delegates to `varar-core`. Steps are
//! supplied by the caller (Rust compiles step files in; there is no dynamic
//! `load_steps`), as a `Registry` plus a context factory.
//!
// `run_example` surfaces varar-core's `StepFailure` by value, matching that
// crate's own `#![allow(clippy::result_large_err)]` public-API choice.
#![allow(clippy::result_large_err)]

pub mod baseline_store;
pub mod discovery;
pub mod render;
pub mod run;

pub use baseline_store::FileBaselineStore;
pub use discovery::{find_specs, match_spec};
pub use render::render_failure;
pub use run::{example_names, plan_spec, run_example};
