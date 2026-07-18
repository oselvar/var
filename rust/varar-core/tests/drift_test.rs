//! Port of `DriftTest.java` / `drift.test.ts` (unit-gated; drift has no golden).

use std::collections::BTreeMap;
use varar_core::drift::{
    BaselineExample, BaselineStore, Drifted, SpecBaseline, VarLock, derive_spec_baseline,
    detect_drift, live_examples, message, parse_var_lock, reconcile_drift, stringify_var_lock,
};
use varar_core::handler::Handler;
use varar_core::hash::hash_source;
use varar_core::parse::parse;
use varar_core::plan::{ExecutionPlan, plan};
use varar_core::registry::{Registry, add_step, create_registry};
use varar_core::span::Span;
use varar_core::step_kind::StepKind;

fn reg(with_step: bool) -> Registry {
    let r = create_registry();
    if with_step {
        add_step(
            &r,
            "I withdraw {int}",
            "steps.ts",
            1,
            Handler::noop(),
            Some(StepKind::Stimulus),
        )
        .unwrap()
    } else {
        r
    }
}

fn roman_reg(with_step: bool) -> Registry {
    let r = create_registry();
    if with_step {
        add_step(
            &r,
            "a decimal and a roman number",
            "steps.ts",
            1,
            Handler::noop(),
            Some(StepKind::Sensor),
        )
        .unwrap()
    } else {
        r
    }
}

fn plan_of(source: &str, r: &Registry) -> ExecutionPlan {
    plan(&parse("w.md", source), r)
}

fn bare(drifts: &[Drifted]) -> Vec<String> {
    drifts
        .iter()
        .map(|d| format!("{}@{}", d.name, d.line))
        .collect()
}

#[derive(Default)]
struct MemoryStore {
    contents: Option<String>,
}

impl BaselineStore for MemoryStore {
    fn read(&self) -> Option<String> {
        self.contents.clone()
    }
    fn write(&mut self, c: &str) {
        self.contents = Some(c.to_string());
    }
}

fn library_lock() -> VarLock {
    let mut specs = BTreeMap::new();
    specs.insert(
        "library.md".to_string(),
        SpecBaseline {
            source_hash: "fnv1a:1a2b3c4d".to_string(),
            examples: vec![BaselineExample {
                name: "I check out".to_string(),
                line: 7,
            }],
        },
    );
    VarLock { version: 1, specs }
}

#[test]
fn hash_matches_the_typescript_vectors() {
    assert_eq!("fnv1a:4f9f2cab", hash_source("hello"));
    assert_eq!("fnv1a:1a47e90b", hash_source("abc"));
    assert_eq!("fnv1a:4eace75e", hash_source("# Title\n"));
}

#[test]
fn live_examples_records_one_entry_per_example_producing_paragraph() {
    let var_doc = parse("w.md", "I withdraw 40.");
    assert_eq!(
        vec![BaselineExample {
            name: "I withdraw 40".to_string(),
            line: 1
        }],
        live_examples(&var_doc, &plan_of("I withdraw 40.", &reg(true)))
    );
}

#[test]
fn derive_spec_baseline_carries_the_fingerprint() {
    let source = "I withdraw 40.";
    let var_doc = parse("w.md", source);
    let baseline = derive_spec_baseline(source, &var_doc, &plan_of(source, &reg(true)));
    assert_eq!(hash_source(source), baseline.source_hash);
    assert_eq!(
        vec![BaselineExample {
            name: "I withdraw 40".to_string(),
            line: 1
        }],
        baseline.examples
    );
}

#[test]
fn no_baseline_means_no_drift() {
    let var_doc = parse("w.md", "I withdraw 40.");
    assert!(detect_drift(None, &var_doc, &plan_of("I withdraw 40.", &reg(true))).is_empty());
}

#[test]
fn a_renamed_step_drifts() {
    let source = "I withdraw 40.";
    let var_doc = parse("w.md", source);
    let baseline = derive_spec_baseline(source, &var_doc, &plan_of(source, &reg(true)));
    assert_eq!(
        vec!["I withdraw 40@1".to_string()],
        bare(&detect_drift(
            Some(&baseline),
            &var_doc,
            &plan_of(source, &reg(false))
        ))
    );
}

#[test]
fn an_in_place_typo_drifts() {
    let before = "I withdraw 40.";
    let baseline =
        derive_spec_baseline(before, &parse("w.md", before), &plan_of(before, &reg(true)));
    let after = "I withdrraw 40.";
    let after_doc = parse("w.md", after);
    assert_eq!(
        vec!["I withdraw 40@1".to_string()],
        bare(&detect_drift(
            Some(&baseline),
            &after_doc,
            &plan_of(after, &reg(true))
        ))
    );
}

#[test]
fn a_deleted_paragraph_is_not_drift() {
    let before = "I withdraw 40.";
    let baseline =
        derive_spec_baseline(before, &parse("w.md", before), &plan_of(before, &reg(true)));
    let after_doc = parse("w.md", "");
    assert!(detect_drift(Some(&baseline), &after_doc, &plan_of("", &reg(true))).is_empty());
}

#[test]
fn moving_and_rewording_a_still_matching_example_does_not_drift() {
    let before = "I withdraw 40.\n\nI withdraw 10.";
    let baseline =
        derive_spec_baseline(before, &parse("w.md", before), &plan_of(before, &reg(true)));
    let after = "I withdraw 11.\n\nI withdraw 40.";
    assert!(
        detect_drift(
            Some(&baseline),
            &parse("w.md", after),
            &plan_of(after, &reg(true))
        )
        .is_empty()
    );
}

#[test]
fn move_reword_prose_on_old_line_does_not_false_positive() {
    let before = "I withdraw 40.";
    let baseline =
        derive_spec_baseline(before, &parse("w.md", before), &plan_of(before, &reg(true)));
    let after = "Just some notes.\n\nI withdraw 41.";
    assert!(
        detect_drift(
            Some(&baseline),
            &parse("w.md", after),
            &plan_of(after, &reg(true))
        )
        .is_empty()
    );
}

#[test]
fn a_paragraph_rewritten_past_recognition_is_not_drift() {
    let before = "I withdraw 40.";
    let baseline =
        derive_spec_baseline(before, &parse("w.md", before), &plan_of(before, &reg(true)));
    let after = "The branch closed years ago.";
    assert!(
        detect_drift(
            Some(&baseline),
            &parse("w.md", after),
            &plan_of(after, &reg(true))
        )
        .is_empty()
    );
}

const ROMAN: &str = "Each row gives a decimal and a roman number:\n\n| decimal | roman |\n| ------: | :---- |\n| 3 | III |\n| 9 | IX |\n";

#[test]
fn header_bound_table_records_its_binding_paragraph_once() {
    let var_doc = parse("r.md", ROMAN);
    assert_eq!(
        vec![BaselineExample {
            name: "Each row gives a decimal and a roman number:".to_string(),
            line: 1
        }],
        live_examples(&var_doc, &plan(&var_doc, &roman_reg(true)))
    );
}

#[test]
fn a_header_bound_binding_paragraph_that_stops_matching_drifts() {
    let var_doc = parse("r.md", ROMAN);
    let baseline = derive_spec_baseline(ROMAN, &var_doc, &plan(&var_doc, &roman_reg(true)));
    assert_eq!(
        vec!["Each row gives a decimal and a roman number:@1".to_string()],
        bare(&detect_drift(
            Some(&baseline),
            &var_doc,
            &plan(&var_doc, &roman_reg(false))
        ))
    );
}

#[test]
fn reconcile_records_then_reports_and_preserves_on_drift() {
    let source = "I withdraw 40.";
    let var_doc = parse("w.md", source);
    let mut store = MemoryStore::default();
    assert!(
        reconcile_drift(
            &mut store,
            "w.md",
            source,
            &var_doc,
            &plan_of(source, &reg(true)),
            false
        )
        .is_empty()
    );
    let before_lock = store.contents.clone();
    let drifts = reconcile_drift(
        &mut store,
        "w.md",
        source,
        &var_doc,
        &plan_of(source, &reg(false)),
        false,
    );
    assert_eq!(vec!["I withdraw 40@1".to_string()], bare(&drifts));
    assert_eq!(before_lock, store.contents); // preserved while unacknowledged
}

#[test]
fn reconcile_update_mode_accepts_drift() {
    let source = "I withdraw 40.";
    let var_doc = parse("w.md", source);
    let mut store = MemoryStore::default();
    reconcile_drift(
        &mut store,
        "w.md",
        source,
        &var_doc,
        &plan_of(source, &reg(true)),
        false,
    );
    assert!(
        reconcile_drift(
            &mut store,
            "w.md",
            source,
            &var_doc,
            &plan_of(source, &reg(false)),
            true
        )
        .is_empty()
    );
    let lock = parse_var_lock(store.contents.as_ref().unwrap()).unwrap();
    assert_eq!(
        Vec::<BaselineExample>::new(),
        lock.specs.get("w.md").unwrap().examples
    );
}

const EXPECTED_LOCK: &str = "{\n  \"version\": 1,\n  \"specs\": {\n    \"library.md\": {\n      \"sourceHash\": \"fnv1a:1a2b3c4d\",\n      \"examples\": [\n        {\n          \"name\": \"I check out\",\n          \"line\": 7\n        }\n      ]\n    }\n  }\n}\n";

#[test]
fn stringify_matches_the_typescript_serializer_byte_for_byte() {
    assert_eq!(EXPECTED_LOCK, stringify_var_lock(&library_lock()));
}

#[test]
fn parse_round_trips_a_valid_lock() {
    let parsed = parse_var_lock(&stringify_var_lock(&library_lock())).unwrap();
    assert_eq!(
        "fnv1a:1a2b3c4d",
        parsed.specs.get("library.md").unwrap().source_hash
    );
    assert_eq!(
        vec![BaselineExample {
            name: "I check out".to_string(),
            line: 7
        }],
        parsed.specs.get("library.md").unwrap().examples
    );
}

#[test]
fn parse_rejects_malformed_input() {
    assert!(parse_var_lock("not json").is_none());
    assert!(parse_var_lock("{}").is_none());
    assert!(parse_var_lock("{\"version\":2,\"specs\":{}}").is_none());
    assert!(parse_var_lock("{\"version\":1,\"specs\":{\"a.md\":{\"examples\":[]}}}").is_none());
}

#[test]
fn drift_message_names_the_paragraph() {
    let d = Drifted {
        name: "I withdraw 40".to_string(),
        line: 1,
        span: Span::from_offsets("I withdraw 40.", 0, 13),
    };
    assert!(message(&d).contains("I withdraw 40"));
    assert!(!message(&d).trim().is_empty());
}
