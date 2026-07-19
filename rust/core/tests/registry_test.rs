//! Port of `RegistryTest.java` / `registry.test.ts`. Java's `Pattern.compile(...)`
//! becomes a bare regexp `&str`; the `assertThrows(UnsupportedOperationException)`
//! immutability clause is dropped (Rust values are immutable).

use std::rc::Rc;
use varar_core::error::RegistryError;
use varar_core::handler::Handler;
use varar_core::registry::{CustomParameterType, add_step, create_registry, define_parameter_type};
use varar_core::step_kind::StepKind;
use varar_core::value::Value;

#[test]
fn create_registry_returns_an_empty_registry_with_default_parameter_types() {
    let r = create_registry();
    assert_eq!(0, r.steps.len());
}

#[test]
fn add_step_returns_a_new_registry_original_is_unchanged() {
    let r0 = create_registry();
    let r1 = add_step(&r0, "I have {int} cukes", "steps.ts", 1, Handler::noop(), None).unwrap();
    assert_eq!(0, r0.steps.len());
    assert_eq!(1, r1.steps.len());
    assert_eq!("I have {int} cukes", r1.steps[0].expression);
}

#[test]
fn define_parameter_type_makes_a_custom_type_available_to_subsequent_step_compilations() {
    let r = create_registry();
    let with_type =
        define_parameter_type(&r, "airport", "[A-Z]{3}", Rc::new(|g: &[&str]| Value::from(g[0])));
    assert!(
        add_step(&with_type, "I fly to {airport}", "steps.ts", 1, Handler::noop(), None).is_ok()
    );
}

#[test]
fn define_parameter_type_returned_step_actually_matches_the_regex_at_runtime() {
    let r = create_registry();
    let r = define_parameter_type(
        &r,
        "airport",
        "[A-Z]{3}",
        Rc::new(|g: &[&str]| Value::from(g[0].to_lowercase())),
    );
    let r = add_step(&r, "I fly to {airport}", "steps.ts", 1, Handler::noop(), None).unwrap();
    let matched = r.steps[0].compiled.match_whole("I fly to LHR");
    assert!(matched.is_some());
    assert_eq!(Value::from("lhr"), matched.unwrap()[0].value);
}

#[test]
fn add_step_throws_on_duplicate_expressions_listing_both_source_positions() {
    let r = create_registry();
    let with_first = add_step(&r, "I have {int} cukes", "a.ts", 3, Handler::noop(), None).unwrap();
    let err = match add_step(&with_first, "I have {int} cukes", "b.ts", 9, Handler::noop(), None) {
        Ok(_) => panic!("expected a duplicate-step error"),
        Err(e) => e,
    };
    let RegistryError::DuplicateStep(msg) = err else {
        panic!("expected duplicate error")
    };
    assert!(msg.contains("duplicate step definition"));
    assert!(msg.contains("a.ts:3"));
    assert!(msg.contains("b.ts:9"));
}

#[test]
fn add_step_carries_the_step_kind_through_to_the_registration() {
    let r = add_step(
        &create_registry(),
        "I greet {string}",
        "a.steps.ts",
        1,
        Handler::noop(),
        Some(StepKind::Sensor),
    )
    .unwrap();
    assert_eq!(Some(StepKind::Sensor), r.steps[0].kind);
}

#[test]
fn kind_is_optional_legacy_step_path() {
    let r =
        add_step(&create_registry(), "I greet {string}", "a.steps.ts", 1, Handler::noop(), None)
            .unwrap();
    assert_eq!(None, r.steps[0].kind);
}

#[test]
fn define_parameter_type_records_the_custom_type_immutably() {
    let r0 = create_registry();
    assert_eq!(Vec::<CustomParameterType>::new(), r0.custom_parameter_types);
    let r1 =
        define_parameter_type(&r0, "airport", "[A-Z]{3}", Rc::new(|g: &[&str]| Value::from(g[0])));
    assert_eq!(vec![CustomParameterType::new("airport", "[A-Z]{3}")], r1.custom_parameter_types);
    // The original registry value is untouched.
    assert_eq!(Vec::<CustomParameterType>::new(), r0.custom_parameter_types);
}
