//! Port of `MatcherTest.java` / `matcher.test.ts`.

use var_core::handler::Handler;
use var_core::matcher::{ResolvedSteps, find_hits, resolve_hits};
use var_core::offsets::{utf16_index, utf16_len, utf16_slice};
use var_core::registry::{Registry, add_step, create_registry};
use var_core::value::Value;

fn reg() -> Registry {
    let r = create_registry();
    let r = add_step(
        &r,
        "I have {int} cukes",
        "steps.ts",
        1,
        Handler::noop(),
        None,
    )
    .unwrap();
    add_step(&r, "I withdraw {int}", "steps.ts", 5, Handler::noop(), None).unwrap()
}

#[test]
fn find_hits_returns_no_hits_when_nothing_matches() {
    assert!(find_hits("hello world", &reg()).is_empty());
}

#[test]
fn find_hits_returns_one_hit_per_step_expression_that_matches() {
    let hits = find_hits("Given I have 5 cukes in my belly", &reg());
    assert_eq!(1, hits.len());
    assert_eq!("I have {int} cukes", hits[0].expression);
    assert_eq!(6, hits[0].match_start);
    assert_eq!(20, hits[0].match_end);
    assert_eq!(vec![Value::Int(5)], hits[0].args);
}

#[test]
fn find_hits_returns_multiple_hits_when_multiple_expressions_match_non_overlapping_ranges() {
    let hits = find_hits("I have 5 cukes and I withdraw 3", &reg());
    let exprs: Vec<String> = hits.iter().map(|h| h.expression.clone()).collect();
    assert_eq!(
        vec![
            "I have {int} cukes".to_string(),
            "I withdraw {int}".to_string()
        ],
        exprs
    );
}

#[test]
fn resolve_hits_picks_longest_leftmost_when_ranges_overlap() {
    let r = create_registry();
    let r = add_step(&r, "I have {int} cukes", "s.ts", 1, Handler::noop(), None).unwrap();
    let r = add_step(
        &r,
        "I have {int} cukes in my belly",
        "s.ts",
        2,
        Handler::noop(),
        None,
    )
    .unwrap();
    let result = resolve_hits(find_hits("I have 5 cukes in my belly", &r));
    let ResolvedSteps::Ok(steps) = result else {
        panic!("expected Ok")
    };
    assert_eq!(1, steps.len());
    assert_eq!("I have {int} cukes in my belly", steps[0].expression);
}

#[test]
fn resolve_hits_returns_ambiguous_when_same_start_and_same_length_match() {
    let r = create_registry();
    let r = add_step(&r, "I have {int} cukes", "s.ts", 1, Handler::noop(), None).unwrap();
    let r = add_step(&r, "I have {int} {word}", "s.ts", 2, Handler::noop(), None).unwrap();
    let result = resolve_hits(find_hits("I have 5 cukes", &r));
    let ResolvedSteps::Ambiguous(collisions) = result else {
        panic!("expected Ambiguous")
    };
    assert_eq!(1, collisions.len());
    assert_eq!(2, collisions[0].candidates.len());
}

#[test]
fn resolve_hits_returns_all_non_overlapping_hits_left_to_right() {
    let r = create_registry();
    let r = add_step(&r, "I have {int} cukes", "s.ts", 1, Handler::noop(), None).unwrap();
    let r = add_step(&r, "I withdraw {int}", "s.ts", 2, Handler::noop(), None).unwrap();
    let result = resolve_hits(find_hits("Given I have 5 cukes and I withdraw 3", &r));
    let ResolvedSteps::Ok(steps) = result else {
        panic!("expected Ok")
    };
    let exprs: Vec<String> = steps.iter().map(|h| h.expression.clone()).collect();
    assert_eq!(
        vec![
            "I have {int} cukes".to_string(),
            "I withdraw {int}".to_string()
        ],
        exprs
    );
}

#[test]
fn param_spans_use_utf16_offsets_across_an_astral_character_no_manual_conversion_needed() {
    let r = create_registry();
    let r = add_step(&r, "I like {string}", "s.ts", 1, Handler::noop(), None).unwrap();

    let sentence = "😀 I like \"tea\"";

    let hits = find_hits(sentence, &r);
    assert_eq!(1, hits.len());
    let hit = &hits[0];

    let expected_match_start = utf16_index(sentence, sentence.find("I like").unwrap());
    assert_eq!(expected_match_start, hit.match_start);
    assert_eq!(utf16_len(sentence), hit.match_end);

    assert_eq!(1, hit.param_spans.len());
    let span = hit.param_spans[0];
    let quote_open = utf16_index(sentence, sentence.find('"').unwrap());
    assert_eq!(quote_open, span.start);
    assert_eq!(utf16_len(sentence), span.end);
    assert_eq!("\"tea\"", utf16_slice(sentence, span.start, span.end));
    assert_eq!(vec![Value::from("tea")], hit.args);
}

// -----------------------------------------------------------------------------
// Custom parameter types with capture groups (Java CaptureGroupTransformer /
// Python parse(*groups) parity)
// -----------------------------------------------------------------------------

#[test]
fn a_custom_type_with_capture_groups_passes_each_group_to_parse() {
    use std::rc::Rc;
    use var_core::registry::define_parameter_type;
    let r = define_parameter_type(
        &create_registry(),
        "range",
        r"(\d+)-(\d+)",
        Rc::new(|groups: &[&str]| {
            Value::list(groups.iter().map(|g| Value::from(*g)).collect::<Vec<_>>())
        }),
    );
    let r = add_step(&r, "the range is {range}", "s.rs", 1, Handler::noop(), None).unwrap();
    let hits = find_hits("the range is 10-20", &r);
    assert_eq!(1, hits.len());
    assert_eq!(
        vec![Value::list(vec![Value::from("10"), Value::from("20")])],
        hits[0].args
    );
}

#[test]
fn a_custom_type_without_groups_still_receives_the_whole_match() {
    use std::rc::Rc;
    use var_core::registry::define_parameter_type;
    let r = define_parameter_type(
        &create_registry(),
        "airport",
        "[A-Z]{3}",
        Rc::new(|groups: &[&str]| {
            assert_eq!(1, groups.len());
            Value::from(groups[0].to_lowercase())
        }),
    );
    let r = add_step(&r, "I fly to {airport}", "s.rs", 1, Handler::noop(), None).unwrap();
    let hits = find_hits("I fly to LHR", &r);
    assert_eq!(vec![Value::from("lhr")], hits[0].args);
}
