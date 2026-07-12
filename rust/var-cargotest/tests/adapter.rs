//! Unit tests for the adapter's per-example runner (the libtest binding itself
//! is exercised end-to-end by the sample project in examples/rust-cargotest).

use var_cargotest::run_one;
use var_core::handler::Handler;
use var_core::registry::{Registry, add_step, create_registry};
use var_core::step_kind::StepKind;
use var_core::value::Value;

fn build_registry() -> Registry {
    add_step(
        &create_registry(),
        "the answer is {int}",
        "s.rs",
        1,
        Handler::sync1(|_state, _expected| Ok(Some(Value::Int(42)))),
        Some(StepKind::Sensor),
    )
    .unwrap()
}

fn context(_file: &str) -> Value {
    Value::Null
}

#[test]
fn a_matching_example_passes() {
    let source = "# Q\n\nthe answer is 42.";
    assert!(run_one("q.md", source, "q.md", build_registry, context, 0).is_ok());
}

#[test]
fn a_mismatching_example_fails_with_a_rendered_message() {
    let source = "# Q\n\nthe answer is 41.";
    let err = run_one("q.md", source, "q.md", build_registry, context, 0).unwrap_err();
    assert!(err.contains("Cell mismatch"), "unexpected render: {err}");
    assert!(err.contains("41") && err.contains("42"));
}
