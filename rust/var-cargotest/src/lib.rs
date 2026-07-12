//! `var-cargotest` — the `cargo test` adapter (ADR 0007).
//!
//! Turns every Markdown example matched by `var.config.json` into one
//! `libtest-mimic` test, reported/filtered/listed by `cargo test` like a native
//! `#[test]`. var-core is single-threaded (`Rc`, not `Send`), so each test body
//! captures only owned `Send` data — the spec path/source plus `fn` pointers to
//! the step registry + context factory — and **re-derives its one example
//! thread-locally** (re-parse, re-plan, run index `i`). No `Rc` value crosses a
//! thread boundary.
//!
//! Usage from a consumer's `tests/specs.rs` (with `harness = false`):
//! ```ignore
//! fn main() {
//!     var_cargotest::run(
//!         std::path::Path::new(env!("CARGO_MANIFEST_DIR")),
//!         my_steps::build_registry,   // fn() -> Registry
//!         my_steps::context_value,    // fn(&str) -> Value
//!     );
//! }
//! ```
#![allow(clippy::result_large_err)]

use std::path::Path;

use libtest_mimic::{Arguments, Failed, Trial};
use var_core::drift::{self, reconcile_drift};
use var_core::parse::parse;
use var_core::registry::Registry;
use var_core::value::Value;
use var_runner::{
    FileBaselineStore, example_names, find_specs, plan_spec, render_failure, run_example,
};

/// Build a registry (`fn`, not a closure — must be `Send + Copy`).
pub type BuildRegistry = fn() -> Registry;
/// Map a step file to its fresh initial state.
pub type ContextFactory = fn(&str) -> Value;

/// Re-derive and run one example by index. This is what each example `Trial`
/// closure calls; kept public so it is unit-testable.
pub fn run_one(
    spec_file: &str,
    source: &str,
    rel: &str,
    build_registry: BuildRegistry,
    context: ContextFactory,
    index: usize,
) -> Result<(), String> {
    let registry = build_registry();
    let execution = plan_spec(spec_file, source, &registry);
    let context_factory = move |file: &str| context(file);
    run_example(&execution, &context_factory, index)
        .map_err(|failure| render_failure(&failure, source, rel))
}

/// Enumerate every example (and any drift) as `libtest-mimic` trials. Drift is
/// reconciled here, on the main thread: a clean run rewrites `var.lock.json`;
/// `VAR_UPDATE=1` accepts drift instead of failing.
pub fn trials(root: &Path, build_registry: BuildRegistry, context: ContextFactory) -> Vec<Trial> {
    let config = read_config(root);
    let update = matches!(std::env::var("VAR_UPDATE").as_deref(), Ok("1") | Ok("true"));
    let mut trials = Vec::new();

    for spec_path in find_specs(&config, root) {
        let source = std::fs::read_to_string(&spec_path).unwrap_or_default();
        let spec_file = spec_path
            .file_name()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        let rel = spec_path
            .strip_prefix(root)
            .unwrap_or(&spec_path)
            .to_string_lossy()
            .into_owned();

        let registry = build_registry();
        let execution = plan_spec(&spec_file, &source, &registry);

        for (index, display) in example_names(&execution).into_iter().enumerate() {
            let (sf, src, r) = (spec_file.clone(), source.clone(), rel.clone());
            trials.push(Trial::test(format!("{rel}::{display}"), move || {
                run_one(&sf, &src, &r, build_registry, context, index).map_err(Failed::from)
            }));
        }

        // Drift reconciliation (main thread): rewrites the baseline on a clean
        // run; each drifted paragraph becomes a failing trial (ADR 0002).
        let mut store = FileBaselineStore::new(root);
        let doc = parse(&spec_file, &source);
        for drifted in reconcile_drift(&mut store, &rel, &source, &doc, &execution, update) {
            let message = drift::message(&drifted);
            trials.push(Trial::test(
                format!("{rel}::var:drift:{}", drifted.line),
                move || Err(Failed::from(message)),
            ));
        }
    }
    trials
}

/// The `harness = false` entry point: parse `cargo test` args, build the trials,
/// run, and exit with the appropriate status. Never returns.
pub fn run(root: &Path, build_registry: BuildRegistry, context: ContextFactory) {
    let args = Arguments::from_args();
    libtest_mimic::run(&args, trials(root, build_registry, context)).exit();
}

fn read_config(root: &Path) -> var_config::VarConfig {
    var_config::read_var_config(root).unwrap_or_else(|e| panic!("{e}"))
}
