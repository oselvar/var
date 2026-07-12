//! Port of `ConformanceTest.java` (the var-core half): the var-doc golden gate
//! over every bundle in the shared corpus, plus the registry-projection unit
//! tests. The registry/plan/trace golden gates need per-bundle Rust step
//! fixtures and belong to a future `var` facade crate (as in Java, where they
//! live in the `var` module).

use std::fs;
use std::path::{Path, PathBuf};
use var_core::canonical_json::canonical_stringify;
use var_core::conformance::{parameter_type_names, to_registry_artifact, to_var_doc_artifact};
use var_core::handler::Handler;
use var_core::parse::parse;
use var_core::registry::{add_step, create_registry, define_parameter_type};
use var_core::step_kind::StepKind;
use var_core::value::Value;

fn bundles_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../conformance/bundles")
}

fn bundle_dirs() -> Vec<PathBuf> {
    let dir = bundles_dir();
    assert!(
        dir.is_dir(),
        "expected conformance corpus at {}",
        dir.display()
    );
    let mut dirs: Vec<PathBuf> = fs::read_dir(&dir)
        .unwrap()
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.is_dir())
        .collect();
    dirs.sort();
    dirs
}

#[test]
fn var_doc_matches_golden() {
    let mut failures = Vec::new();
    for bundle in bundle_dirs() {
        let name = bundle.file_name().unwrap().to_string_lossy().to_string();
        let source = fs::read_to_string(bundle.join("example.md")).unwrap();
        let doc = parse("example.md", &source);
        let actual = canonical_stringify(&to_var_doc_artifact(&doc));
        let expected = fs::read_to_string(bundle.join("golden").join("var-doc.json")).unwrap();
        if actual != expected {
            failures.push(name);
        }
    }
    assert!(
        failures.is_empty(),
        "var-doc.json mismatch in bundles: {failures:?}"
    );
}

#[test]
fn to_registry_artifact_lists_expressions_and_parsed_parameter_type_names() {
    let r = add_step(
        &create_registry(),
        "I have {int} cukes",
        "s.ts",
        1,
        Handler::noop(),
        None,
    )
    .unwrap();
    let artifact = to_registry_artifact(&r);
    let Value::Map(m) = &artifact else {
        panic!("expected map")
    };
    assert_eq!(Some(&Value::List(vec![])), m.get("parameterTypes"));
    let Value::List(steps) = m.get("steps").unwrap() else {
        panic!("expected steps list")
    };
    assert_eq!(1, steps.len());
    let Value::Map(step0) = &steps[0] else {
        panic!("expected step map")
    };
    assert_eq!(
        Some(&Value::from("I have {int} cukes")),
        step0.get("expression")
    );
    assert_eq!(
        Some(&Value::List(vec![Value::from("int")])),
        step0.get("parameterTypeNames")
    );
}

#[test]
fn to_registry_artifact_reads_parameter_names_from_the_ast_ignoring_escaped_braces() {
    // A naive `{...}` regex would wrongly count the escaped `\{a, b\}`.
    assert_eq!(
        vec!["int".to_string()],
        parameter_type_names("the set \\{a, b\\} has {int} elements")
    );
}

#[test]
fn registry_artifact_projects_custom_parameter_types() {
    let r = create_registry();
    let r = define_parameter_type(
        &r,
        "airport",
        "[A-Z]{3}",
        std::rc::Rc::new(|g: &[&str]| Value::from(g[0])),
    );
    let r = add_step(
        &r,
        "I fly to {airport}",
        "airports.steps",
        1,
        Handler::noop(),
        Some(StepKind::Stimulus),
    )
    .unwrap();
    let artifact = to_registry_artifact(&r);
    let Value::Map(m) = &artifact else {
        panic!("expected map")
    };
    let mut pt = std::collections::BTreeMap::new();
    pt.insert("name".to_string(), Value::from("airport"));
    pt.insert("regexp".to_string(), Value::from("[A-Z]{3}"));
    assert_eq!(
        Some(&Value::List(vec![Value::Map(pt)])),
        m.get("parameterTypes")
    );
    let Value::List(steps) = m.get("steps").unwrap() else {
        panic!("expected steps list")
    };
    let Value::Map(step0) = &steps[0] else {
        panic!("expected step map")
    };
    assert_eq!(
        Some(&Value::List(vec![Value::from("airport")])),
        step0.get("parameterTypeNames")
    );
}
