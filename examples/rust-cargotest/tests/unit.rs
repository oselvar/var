//! Checks the adapter's libtest harness can't express as items: that the config
//! globs discover exactly the six specs, and that a deliberately-wrong
//! expectation renders a cell mismatch (hello-var.md's "watch it fail").

use example::steps::{build_registry, context_value};
use std::path::Path;
use varar_cargotest::run_one;
use varar_config::read_var_config;
use varar_runner::find_specs;

fn root() -> &'static Path {
    Path::new(env!("CARGO_MANIFEST_DIR"))
}

#[test]
fn discovery_matches_config() {
    let config = read_var_config(root()).unwrap();
    let mut names: Vec<String> = find_specs(&config, root())
        .iter()
        .map(|p| p.file_name().unwrap().to_string_lossy().into_owned())
        .collect();
    names.sort();
    assert_eq!(
        names,
        vec![
            "deep-thought.md",
            "hello-var.md",
            "library.md",
            "roman-numerals.md",
            "tables-and-docstrings.md",
            "yahtzee.md",
        ]
    );
}

#[test]
fn a_mutated_expectation_fails_with_a_cell_mismatch() {
    let source = std::fs::read_to_string(root().join("hello-var.md"))
        .unwrap()
        .replace("\"Hello, world!\"", "\"Hello, Vár!\"");
    let err = run_one(
        "hello-var.md",
        &source,
        "hello-var.md",
        build_registry,
        context_value,
        0,
    )
    .expect_err("expected a failure");
    // Expected column is the source token as written (quotes included); actual
    // is what the sensor returned.
    assert!(
        err.contains("Cell mismatch")
            && err.contains("Hello, Vár!")
            && err.contains("Hello, world!"),
        "unexpected failure rendering:\n{err}"
    );
}
