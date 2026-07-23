//! Port of `PlanTest.java` / `plan.test.ts`.

mod common;

use common::vmap;
use varar_core::cell_diff::RowCheck;
use varar_core::diagnostics::DiagnosticCode;
use varar_core::handler::Handler;
use varar_core::offsets::utf16_slice;
use varar_core::parse::parse;
use varar_core::plan::plan;
use varar_core::registry::{Registry, add_step, create_registry};
use varar_core::step_kind::StepKind;
use varar_core::value::Value;

fn reg() -> Registry {
    let r = create_registry();
    let r = add_step(
        &r,
        "I have {int} in my account",
        "steps.ts",
        1,
        Handler::noop(),
        Some(StepKind::Stimulus),
    )
    .unwrap();
    let r =
        add_step(&r, "I withdraw {int}", "steps.ts", 2, Handler::noop(), Some(StepKind::Stimulus))
            .unwrap();
    add_step(
        &r,
        "I should have {int} left",
        "steps.ts",
        3,
        Handler::noop(),
        Some(StepKind::Stimulus),
    )
    .unwrap()
}

fn step(r: &Registry, expr: &str, file: &str, line: usize) -> Registry {
    add_step(r, expr, file, line, Handler::noop(), Some(StepKind::Stimulus)).unwrap()
}

fn step_texts(ex: &varar_core::plan::PlannedExample) -> Vec<String> {
    ex.steps.iter().map(|s| s.text.clone()).collect()
}

#[test]
fn plan_produces_a_planned_example_with_steps_in_document_order() {
    let source = "# Withdrawing\n\nGiven I have 100 in my account. When I withdraw 40. Then I should have 60 left.";
    let var_doc = parse("w.md", source);
    let result = plan(&var_doc, &reg());
    assert_eq!(0, result.diagnostics.len());
    assert_eq!(1, result.examples.len());
    let ex = &result.examples[0];
    assert_eq!(
        "Given I have 100 in my account. When I withdraw 40. Then I should have 60 left",
        ex.name
    );
    assert_eq!(vec!["Withdrawing".to_string()], ex.scope_stack);
    assert_eq!(
        vec![
            "I have 100 in my account".to_string(),
            "I withdraw 40".to_string(),
            "I should have 60 left".to_string()
        ],
        step_texts(ex)
    );
    assert_eq!(vec![Value::Int(100)], ex.steps[0].args);
}

#[test]
fn plan_emits_an_ambiguous_match_diagnostic_and_produces_no_runnable_example() {
    let r = create_registry();
    let r = step(&r, "I have {int} cukes", "a.ts", 3);
    let r = step(&r, "I have {int} {word}", "a.ts", 8);
    let var_doc = parse("e.md", "# Ambig\n\nGiven I have 5 cukes");
    let result = plan(&var_doc, &r);
    assert_eq!(1, result.diagnostics.len());
    assert_eq!(DiagnosticCode::AmbiguousMatch, result.diagnostics[0].code);
    // An ambiguous candidate has no runnable step, so it is prose (a delimiter),
    // not an example — the diagnostic is the signal. See ADR 0012.
    assert_eq!(0, result.examples.len());
}

#[test]
fn plan_skips_an_example_heading_whose_body_has_no_matches_and_no_keyword_led_sentences() {
    let source = "# Just docs\n\nSome prose with no matches and no keywords.";
    let result = plan(&parse("d.md", source), &reg());
    assert_eq!(0, result.examples.len());
    assert_eq!(0, result.diagnostics.len());
}

#[test]
fn plan_merges_consecutive_list_items_into_one_example() {
    let r = create_registry();
    let r = step(&r, "I have {int} in my account", "s.ts", 1);
    let r = step(&r, "I withdraw {int}", "s.ts", 2);
    // Two list items, no delimiter between them → one example, shared state (ADR
    // 0012). A bulleted scenario reads as Given/When/Then bullets.
    let source = "# Bullets\n\n- Given I have 100 in my account\n- When I withdraw 40";
    let result = plan(&parse("b.md", source), &r);
    assert_eq!(1, result.examples.len());
    assert_eq!(
        vec![
            "I have 100 in my account".to_string(),
            "I withdraw 40".to_string()
        ],
        step_texts(&result.examples[0])
    );
}

#[test]
fn plan_walks_blockquote_content_as_step_bearing() {
    let r = create_registry();
    let r = step(&r, "I have {int} in my account", "s.ts", 1);
    let source = "# Quote\n\n> Given I have 100 in my account";
    let result = plan(&parse("q.md", source), &r);
    assert_eq!(1, result.examples[0].steps.len());
}

#[test]
fn a_markdown_table_immediately_following_a_step_bearing_block_attaches_as_data_table() {
    let r = create_registry();
    let r = step(&r, "these users exist", "s.ts", 1);
    let source = "# Users\nGiven these users exist:\n\n| name | age |\n|------|-----|\n| Bob  | 30  |\n| Eve  | 25  |";
    let result = plan(&parse("u.md", source), &r);
    let step0 = &result.examples[0].steps[0];
    let table = step0.data_table.as_ref().expect("data table");
    assert_eq!(vec!["name".to_string(), "age".to_string()], table.header.cells);
    assert_eq!(2, table.rows.len());
}

#[test]
fn a_table_not_immediately_after_a_step_bearing_block_does_not_attach() {
    let r = create_registry();
    let r = step(&r, "these users exist", "s.ts", 1);
    let source = "# Mid\nGiven these users exist:\n\nSome interrupting prose.\n\n| name | age |\n|------|-----|\n| Bob  | 30  |";
    let result = plan(&parse("m.md", source), &r);
    assert!(result.examples[0].steps[0].data_table.is_none());
}

#[test]
fn a_fenced_code_block_immediately_following_a_step_bearing_block_attaches_as_doc_string() {
    let r = create_registry();
    let r = step(&r, "I send the payload", "s.ts", 1);
    let source = "# Payload\nWhen I send the payload:\n\n```json\n{ \"action\": \"import\" }\n```";
    let result = plan(&parse("p.md", source), &r);
    let step0 = &result.examples[0].steps[0];
    let doc = step0.doc_string.as_ref().expect("doc string");
    assert_eq!("json", doc.info);
    assert_eq!("{ \"action\": \"import\" }\n", doc.body);
}

#[test]
fn a_step_with_no_following_fence_has_no_doc_string() {
    let r = create_registry();
    let r = step(&r, "I send the payload", "s.ts", 1);
    let result = plan(&parse("p.md", "# P\nWhen I send the payload"), &r);
    assert!(result.examples[0].steps[0].doc_string.is_none());
}

#[test]
fn a_keyword_led_sentence_with_no_match_does_not_produce_a_diagnostic() {
    let r = create_registry();
    let result = plan(&parse("m.md", "# Empty\n\nGiven I have 5 cukes in my belly."), &r);
    assert_eq!(0, result.diagnostics.len());
}

#[test]
fn an_unmatched_sentence_without_a_keyword_is_also_silently_treated_as_prose() {
    let r = create_registry();
    let result = plan(&parse("p.md", "# Prose\n\nI have 5 cukes in my belly."), &r);
    assert_eq!(0, result.diagnostics.len());
}

const YAHTZEE: &str = "# Yahtzee\n\neach row lists the dice, the category and the score:\n\n| dice          | category   | score |\n| ------------- | ---------- | ----- |\n| 3, 3, 3, 4, 4 | full house | 17    |\n| 3, 3, 3, 3, 3 | Yahtzee    | 50    |";

#[test]
fn a_header_bound_table_expands_into_one_example_per_row() {
    let r = create_registry();
    let r = step(&r, "each row lists the dice, the category and the score", "s.ts", 1);
    let result = plan(&parse("y.md", YAHTZEE), &r);
    assert_eq!(0, result.diagnostics.len());
    assert_eq!(2, result.examples.len());
    let first = &result.examples[0];
    let second = &result.examples[1];
    assert_eq!(1, first.steps.len());
    assert_eq!(
        vec![vmap(vec![
            ("dice", Value::from("3, 3, 3, 4, 4")),
            ("category", Value::from("full house")),
            ("score", Value::from("17")),
        ])],
        first.steps[0].args
    );
    assert_eq!(
        vec![vmap(vec![
            ("dice", Value::from("3, 3, 3, 3, 3")),
            ("category", Value::from("Yahtzee")),
            ("score", Value::from("50")),
        ])],
        second.steps[0].args
    );
    assert!(first.steps[0].data_table.is_none());
}

#[test]
fn a_table_whose_paragraph_names_only_some_header_cells_keeps_whole_table_behaviour() {
    let r = create_registry();
    let r = step(&r, "these users exist", "s.ts", 1);
    let source = "# Users\nthese users exist:\n\n| name | age |\n| ---- | --- |\n| Bob  | 30  |\n| Eve  | 25  |";
    let result = plan(&parse("u.md", source), &r);
    assert_eq!(1, result.examples.len());
    let table = result.examples[0].steps[0].data_table.as_ref().unwrap();
    assert_eq!(vec!["name".to_string(), "age".to_string()], table.header.cells);
    assert_eq!(2, table.rows.len());
}

#[test]
fn header_bound_matching_is_case_sensitive() {
    let r = create_registry();
    let r = step(&r, "each row lists the Dice and the Score", "s.ts", 1);
    let source = "# Case\neach row lists the Dice and the Score:\n\n| dice      | score |\n| --------- | ----- |\n| 1,1,1,1,1 | 5     |";
    let result = plan(&parse("c.md", source), &r);
    assert_eq!(1, result.examples.len());
    assert_eq!(
        1,
        result.examples[0].steps[0]
            .data_table
            .as_ref()
            .unwrap()
            .rows
            .len()
    );
}

#[test]
fn header_bound_rows_are_named_by_their_cells_and_nested_under_the_paragraph() {
    let r = create_registry();
    let r = step(&r, "each row lists the dice, the category and the score", "s.ts", 1);
    let result = plan(&parse("y.md", YAHTZEE), &r);
    let names: Vec<String> = result.examples.iter().map(|e| e.name.clone()).collect();
    assert_eq!(
        vec![
            "3, 3, 3, 4, 4 / full house / 17".to_string(),
            "3, 3, 3, 3, 3 / Yahtzee / 50".to_string()
        ],
        names
    );
    for ex in &result.examples {
        assert_eq!(
            vec![
                "Yahtzee".to_string(),
                "each row lists the dice, the category and the score".to_string()
            ],
            ex.scope_stack
        );
    }
    let lines: Vec<usize> = result.examples.iter().map(|e| e.span.start_line).collect();
    assert_ne!(lines[0], lines[1]);
    assert!(lines[0] < lines[1]);
}

#[test]
fn a_table_not_attached_to_a_step_is_allowed_no_diagnostic() {
    let r = create_registry();
    let r = step(&r, "I have {int} cukes", "s.ts", 1);
    let source = "# Detached\n\nGiven I have 5 cukes.\n\nSome interrupting prose paragraph.\n\n| name | age |\n|------|-----|\n| Bob  | 30  |";
    let result = plan(&parse("o.md", source), &r);
    assert_eq!(0, result.diagnostics.len());
}

#[test]
fn a_header_bound_row_example_carries_row_checks() {
    let r = create_registry();
    let r = step(&r, "each row lists the dice, the category and the score", "s.ts", 1);
    let source = "# Yahtzee\n\neach row lists the dice, the category and the score:\n\n| dice          | category   | score |\n| ------------- | ---------- | ----- |\n| 3, 3, 3, 4, 4 | full house | 17    |";
    let result = plan(&parse("y.md", source), &r);
    let checks: &Vec<RowCheck> = result.examples[0]
        .row_checks
        .as_ref()
        .expect("no rowChecks");
    let cols: Vec<String> = checks.iter().map(|c| c.column.clone()).collect();
    assert_eq!(
        vec![
            "dice".to_string(),
            "category".to_string(),
            "score".to_string()
        ],
        cols
    );
    let vals: Vec<String> = checks.iter().map(|c| c.value.clone()).collect();
    assert_eq!(
        vec![
            "3, 3, 3, 4, 4".to_string(),
            "full house".to_string(),
            "17".to_string()
        ],
        vals
    );
    let score_check = &checks[2];
    assert_eq!(
        "17",
        utf16_slice(source, score_check.span.start_offset, score_check.span.end_offset)
    );
}

#[test]
fn an_error_fence_marks_the_example_expected_outcome_fail_with_a_message_substring() {
    let r = add_step(
        &create_registry(),
        "I divide {int} by {int}",
        "s.ts",
        1,
        Handler::noop(),
        Some(StepKind::Stimulus),
    )
    .unwrap();
    let src = "# Division\n\nI divide 1 by 0.\n\n```error\ndivision by zero\n```\n";
    let ex = plan(&parse("e.md", src), &r).examples.remove(0);
    assert_eq!(Some("fail".to_string()), ex.expected_outcome);
    assert_eq!(Some("division by zero".to_string()), ex.expected_error_message);
    assert!(ex.steps[0].doc_string.is_none());
}

#[test]
fn no_error_fence_leaves_expected_outcome_null() {
    let r = add_step(
        &create_registry(),
        "I divide {int} by {int}",
        "s.ts",
        1,
        Handler::noop(),
        Some(StepKind::Stimulus),
    )
    .unwrap();
    let ex = plan(&parse("e.md", "# Division\n\nI divide 1 by 1."), &r)
        .examples
        .remove(0);
    assert_eq!(None, ex.expected_outcome);
}

#[test]
fn an_error_fence_with_no_matching_step_emits_an_error_fence_without_step_diagnostic() {
    let r = add_step(
        &create_registry(),
        "I divide {int} by {int}",
        "s.ts",
        1,
        Handler::noop(),
        Some(StepKind::Stimulus),
    )
    .unwrap();
    let src = "# Nope\n\nThis prose matches nothing.\n\n```error\nboom\n```\n";
    let result = plan(&parse("e.md", src), &r);
    assert_eq!(0, result.examples.len());
    assert_eq!(1, result.diagnostics.len());
    assert_eq!(DiagnosticCode::ErrorFenceWithoutStep, result.diagnostics[0].code);
}

#[test]
fn an_error_fence_on_an_ambiguous_example_emits_both_diagnostics() {
    let r = create_registry();
    let r = step(&r, "I divide {int} by {int}", "s.ts", 1);
    let r = step(&r, "I divide 1 by 0", "s.ts", 2);
    let src = "# Ambiguous\n\nI divide 1 by 0.\n\n```error\nboom\n```\n";
    let result = plan(&parse("e.md", src), &r);
    let mut codes: Vec<DiagnosticCode> = result.diagnostics.iter().map(|d| d.code).collect();
    codes.sort();
    assert_eq!(
        vec![
            DiagnosticCode::AmbiguousMatch,
            DiagnosticCode::ErrorFenceWithoutStep
        ],
        codes
    );
}

#[test]
fn a_doc_string_step_carries_the_fence_body_span_on_its_plan() {
    let r = add_step(
        &create_registry(),
        "the payload is",
        "s.ts",
        1,
        Handler::noop(),
        Some(StepKind::Stimulus),
    )
    .unwrap();
    let source = "# T\n\nthe payload is:\n\n```json\n{ \"ok\": true }\n```";
    let result = plan(&parse("d.md", source), &r);
    let doc = result.examples[0].steps[0]
        .doc_string
        .as_ref()
        .expect("no docString");
    assert_eq!("{ \"ok\": true }\n", doc.body);
    assert_eq!(
        "{ \"ok\": true }\n",
        utf16_slice(source, doc.body_span.start_offset, doc.body_span.end_offset)
    );
}

// ---- Example delimiters (ADR 0012) ----------------------------------------

#[test]
fn consecutive_matching_paragraphs_with_no_delimiter_merge_into_one_example() {
    let source = "I have 100 in my account.\n\nI withdraw 40.\n\nI should have 60 left.";
    let result = plan(&parse("m.md", source), &reg());
    assert_eq!(1, result.examples.len());
    assert_eq!(
        vec![
            "I have 100 in my account".to_string(),
            "I withdraw 40".to_string(),
            "I should have 60 left".to_string()
        ],
        step_texts(&result.examples[0])
    );
    // The name is the first matching paragraph's text.
    assert_eq!("I have 100 in my account", result.examples[0].name);
}

#[test]
fn a_thematic_break_between_matching_paragraphs_splits_them_into_two_examples() {
    let source = "I have 100 in my account.\n\n---\n\nI withdraw 40.";
    let result = plan(&parse("h.md", source), &reg());
    assert_eq!(2, result.examples.len());
    let texts: Vec<Vec<String>> = result.examples.iter().map(step_texts).collect();
    assert_eq!(
        vec![
            vec!["I have 100 in my account".to_string()],
            vec!["I withdraw 40".to_string()]
        ],
        texts
    );
}

#[test]
fn a_heading_between_matching_paragraphs_splits_them_into_two_examples() {
    let source = "I have 100 in my account.\n\n## Next\n\nI withdraw 40.";
    let result = plan(&parse("hd.md", source), &reg());
    assert_eq!(2, result.examples.len());
    assert_eq!(vec!["Next".to_string()], result.examples[1].scope_stack);
}

#[test]
fn a_non_matching_paragraph_prose_between_matching_paragraphs_splits_the_example() {
    let source =
        "I have 100 in my account.\n\nJust explaining what happens next.\n\nI withdraw 40.";
    let result = plan(&parse("p.md", source), &reg());
    assert_eq!(2, result.examples.len());
    let texts: Vec<Vec<String>> = result.examples.iter().map(step_texts).collect();
    assert_eq!(
        vec![
            vec!["I have 100 in my account".to_string()],
            vec!["I withdraw 40".to_string()]
        ],
        texts
    );
}

#[test]
fn leading_and_trailing_prose_does_not_merge_into_an_example() {
    let source = "A preamble that matches nothing.\n\nI withdraw 40.\n\nA closing remark.";
    let result = plan(&parse("pp.md", source), &reg());
    assert_eq!(1, result.examples.len());
    assert_eq!(vec!["I withdraw 40".to_string()], step_texts(&result.examples[0]));
}

#[test]
fn the_multi_table_shape_two_tables_in_one_example_survive_blank_lines() {
    let r = create_registry();
    let r = step(&r, "the following users have been imported", "s.ts", 1);
    let r = step(&r, "the following assets have been imported", "s.ts", 2);
    let source = "Given the following users have been imported:\n\n| email | name |\n| ----- | ---- |\n| a@b.c | Ada  |\n\nAnd the following assets have been imported:\n\n| name  |\n| ----- |\n| Moose |";
    let result = plan(&parse("basket.md", source), &r);
    assert_eq!(1, result.examples.len());
    let ex = &result.examples[0];
    assert_eq!(2, ex.steps.len());
    assert_eq!(1, ex.steps[0].data_table.as_ref().unwrap().rows.len());
    assert_eq!(1, ex.steps[1].data_table.as_ref().unwrap().rows.len());
}
