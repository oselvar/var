//! Port of `ExecuteTest.java` (+ `execute-state`/`execute-roles`). Adaptations
//! (see the plan): the ad-hoc `Fn0/Fn1/Fn2` functional interfaces become
//! [`Handler::sync0/1/2`]; a Java `throw RuntimeException` becomes `Err(_)`
//! (Rust's explicit failure channel), a thrown `AssertionError` becomes `panic!`
//! (the assertion channel) — the executor must handle both identically; a
//! `CompletableFuture` return becomes [`Handler::async0`] driven by the executor's
//! `block_on`.

mod common;

use common::vmap;
use std::any::Any;
use std::cell::RefCell;
use std::future::Future;
use std::pin::Pin;
use std::rc::Rc;
use std::task::{Context, Poll};
use varar_core::diagnostics::{Diagnostic, DiagnosticCode};
use varar_core::error::{HandlerError, StepError};
use varar_core::execute::{
    ExecutePorts, StepObservation, StepOutcome, collect_examples, execute_plan,
};
use varar_core::failure::to_failure;
use varar_core::handler::{Handler, HandlerReturn, StepOutput};
use varar_core::offsets::utf16_slice;
use varar_core::parse::parse;
use varar_core::plan::{ExecutionPlan, plan};
use varar_core::registry::{Registry, add_step, create_registry};
use varar_core::step_kind::StepKind;
use varar_core::value::Value;

type ContextFactory<'a> = varar_core::execute::ContextFactory<'a>;

fn int_of(v: &Value) -> i64 {
    match v {
        Value::Int(i) => *i,
        _ => panic!("not an int: {v:?}"),
    }
}

fn reg(
    expression: &str,
    file: &str,
    line: usize,
    handler: Handler,
    kind: Option<StepKind>,
) -> Registry {
    add_step(&create_registry(), expression, file, line, handler, kind).unwrap()
}

fn plan_of(source: &str, registry: &Registry) -> ExecutionPlan {
    plan(&parse("x.md", source), registry)
}

/// A future that yields `Pending` exactly once (exercising the executor's
/// `block_on` park/resume) then completes — the analog of `supplyAsync`.
struct YieldOnce {
    value: Option<HandlerReturn>,
    yielded: bool,
}

impl Future for YieldOnce {
    type Output = HandlerReturn;
    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<HandlerReturn> {
        let this = self.get_mut();
        if !this.yielded {
            this.yielded = true;
            cx.waker().wake_by_ref();
            return Poll::Pending;
        }
        Poll::Ready(this.value.take().unwrap())
    }
}

// -----------------------------------------------------------------------------
// collectExamples: naming, ordering, diagnostics
// -----------------------------------------------------------------------------

#[test]
fn collect_examples_returns_one_queued_example_per_planned_example_in_document_order() {
    let r = reg(
        "I have {int} cukes",
        "s.ts",
        1,
        Handler::sync1(|_s, _n| Ok(None)),
        Some(StepKind::Stimulus),
    );
    let p = plan_of("# A\n\nI have 5 cukes\n\n# B\n\nI have 9 cukes", &r);
    let ports = ExecutePorts::silent();
    let queued = collect_examples(&p, &ports);
    let names: Vec<String> = queued.iter().map(|q| q.name.clone()).collect();
    assert_eq!(vec!["I have 5 cukes".to_string(), "I have 9 cukes".to_string()], names);
}

#[test]
fn collect_examples_reports_diagnostics_via_reporter() {
    let r = create_registry();
    let r =
        add_step(&r, "I have {int} cukes", "a.ts", 1, Handler::noop(), Some(StepKind::Stimulus))
            .unwrap();
    let r = add_step(&r, "I have 5 cukes", "a.ts", 2, Handler::noop(), Some(StepKind::Stimulus))
        .unwrap();
    let p = plan_of("# M\n\nI have 5 cukes", &r);
    let got: Rc<RefCell<Vec<Diagnostic>>> = Rc::new(RefCell::new(Vec::new()));
    let got2 = got.clone();
    let ports = ExecutePorts::new(Box::new(move |d: &Diagnostic| got2.borrow_mut().push(*d)));
    collect_examples(&p, &ports);
    assert_eq!(1, got.borrow().len());
    assert_eq!(DiagnosticCode::AmbiguousMatch, got.borrow()[0].code);
}

// -----------------------------------------------------------------------------
// Full-replacement state evolution + inline sensor comparison
// -----------------------------------------------------------------------------

#[test]
fn threads_full_replacement_state_and_sensor_compares_return_against_last_captured_arg() {
    let seen: Rc<RefCell<Vec<Value>>> = Rc::new(RefCell::new(Vec::new()));
    let seen2 = seen.clone();
    let r = create_registry();
    let r = add_step(
        &r,
        "I add {int}",
        "s.ts",
        1,
        Handler::sync1(|state, n| {
            let s = match state {
                Value::Null => 0,
                Value::Int(i) => i,
                _ => 0,
            };
            Ok(Some(Value::Int(s + int_of(&n))))
        }),
        Some(StepKind::Stimulus),
    )
    .unwrap();
    let r = add_step(
        &r,
        "the total is {int}",
        "s.ts",
        2,
        Handler::sync1(move |state, expected| {
            seen2.borrow_mut().push(expected);
            Ok(Some(state))
        }),
        Some(StepKind::Sensor),
    )
    .unwrap();
    let p = plan_of("# Adding\n\nI add 5. I add 3. the total is 8.", &r);
    let ports = ExecutePorts {
        reporter: Box::new(|_| {}),
        create_context: Some(Box::new(|_| Rc::new(Value::Int(0)) as Rc<dyn Any>)),
        observer: None,
    };
    let queued = collect_examples(&p, &ports);
    assert_eq!(1, queued.len());
    assert!(queued[0].run().is_ok());
    assert_eq!(vec![Value::Int(8)], *seen.borrow());
}

#[test]
fn an_inline_sensor_mismatch_throws_cell_mismatch_at_its_param_span() {
    let r = reg(
        "the answer is {int}",
        "s.ts",
        1,
        Handler::sync1(|_s, _e| Ok(Some(Value::Int(41)))),
        Some(StepKind::Sensor),
    );
    let p = plan_of("# Q\n\nthe answer is 42.", &r);
    let ports = ExecutePorts::silent();
    let err = collect_examples(&p, &ports)[0].run().unwrap_err();
    let StepError::CellMismatch(cells) = &err.error else {
        panic!("expected cell mismatch")
    };
    assert_eq!(1, cells.len());
    assert_eq!("42", cells[0].expected);
    assert_eq!("41", cells[0].actual);
    let source = &p.var_doc.source;
    assert_eq!("42", utf16_slice(source, cells[0].span.start_offset, cells[0].span.end_offset));
}

#[test]
fn a_sensor_with_two_parameters_returns_a_positional_list_compared_against_every_capture() {
    let r = reg(
        "I should have {int} cukes in my {word} belly",
        "s.ts",
        1,
        Handler::sync2(|_s, count, name| Ok(Some(Value::list(vec![count, name])))),
        Some(StepKind::Sensor),
    );
    let p = plan_of("# X\n\nI should have 3 cukes in my big belly", &r);
    let ports = ExecutePorts::silent();
    assert!(collect_examples(&p, &ports)[0].run().is_ok());
}

#[test]
fn a_sensor_with_two_parameters_returning_a_non_list_throws_return_shape() {
    let r = reg(
        "I should have {int} cukes in my {word} belly",
        "s.ts",
        1,
        Handler::sync2(|_s, _c, _n| Ok(Some(Value::Int(3)))),
        Some(StepKind::Sensor),
    );
    let p = plan_of("# X\n\nI should have 3 cukes in my big belly", &r);
    let ports = ExecutePorts::silent();
    assert!(matches!(
        collect_examples(&p, &ports)[0].run().unwrap_err().error,
        StepError::ReturnShape(_)
    ));
}

#[test]
fn a_sensor_with_two_parameters_returning_the_wrong_length_throws_return_shape() {
    let r = reg(
        "I should have {int} cukes in my {word} belly",
        "s.ts",
        1,
        Handler::sync2(|_s, _c, _n| Ok(Some(Value::list(vec![Value::Int(3)])))),
        Some(StepKind::Sensor),
    );
    let p = plan_of("# X\n\nI should have 3 cukes in my big belly", &r);
    let ports = ExecutePorts::silent();
    assert!(matches!(
        collect_examples(&p, &ports)[0].run().unwrap_err().error,
        StepError::ReturnShape(_)
    ));
}

#[test]
fn a_single_parameter_sensor_wrapping_its_value_in_a_list_fails_the_comparison() {
    let r = reg(
        "the answer is {int}",
        "s.ts",
        1,
        Handler::sync1(|_s, _e| Ok(Some(Value::list(vec![Value::Int(42)])))),
        Some(StepKind::Sensor),
    );
    let p = plan_of("# Q\n\nthe answer is 42.", &r);
    let ports = ExecutePorts::silent();
    assert!(matches!(
        collect_examples(&p, &ports)[0].run().unwrap_err().error,
        StepError::CellMismatch(_)
    ));
}

#[test]
fn a_zero_slot_sensor_returning_a_value_throws_return_shape() {
    let r = reg(
        "the alarm fired",
        "s.ts",
        1,
        Handler::sync0(|_s| Ok(Some(Value::Bool(true)))),
        Some(StepKind::Sensor),
    );
    let p = plan_of("# X\n\nthe alarm fired", &r);
    let ports = ExecutePorts::silent();
    assert!(matches!(
        collect_examples(&p, &ports)[0].run().unwrap_err().error,
        StepError::ReturnShape(_)
    ));
}

#[test]
fn a_zero_slot_sensor_returning_null_passes() {
    let r =
        reg("the alarm fired", "s.ts", 1, Handler::sync0(|_s| Ok(None)), Some(StepKind::Sensor));
    let p = plan_of("# X\n\nthe alarm fired", &r);
    let ports = ExecutePorts::silent();
    assert!(collect_examples(&p, &ports)[0].run().is_ok());
}

#[test]
fn a_slotted_sensor_returning_nothing_throws_return_shape() {
    // The silent-pass hole: nothing is compared, yet the document keeps
    // claiming something nobody checked.
    let r = reg(
        "the name is {string}",
        "s.ts",
        1,
        Handler::sync1(|_s, _name| Ok(None)),
        Some(StepKind::Sensor),
    );
    let p = plan_of("# X\n\nthe name is \"Ada\"", &r);
    let ports = ExecutePorts::silent();
    let err = collect_examples(&p, &ports)[0].run().unwrap_err().error;
    match err {
        StepError::ReturnShape(m) => {
            assert_eq!(m, "a sensor with 1 slot(s) must return one value per slot, got nothing");
        }
        other => panic!("expected ReturnShape, got {other:?}"),
    }
}

#[test]
fn a_header_bound_row_returning_nothing_throws_return_shape() {
    let r = reg(
        "I report the score and grade",
        "s.ts",
        1,
        Handler::sync1(|_s, _row| Ok(None)),
        Some(StepKind::Sensor),
    );
    let source = "# X\n\nI report the score and grade.\n\n\
                  | score | grade |\n\
                  | ----- | ----- |\n\
                  | 10    | A     |\n";
    let p = plan_of(source, &r);
    let ports = ExecutePorts::silent();
    let err = collect_examples(&p, &ports)[0].run().unwrap_err().error;
    match err {
        StepError::ReturnShape(m) => {
            assert_eq!(
                m,
                "a header-bound row step must return a row object with one value per bound cell, got nothing"
            );
        }
        other => panic!("expected ReturnShape, got {other:?}"),
    }
}

// -----------------------------------------------------------------------------
// createContext: once per (example, file), reused across steps
// -----------------------------------------------------------------------------

#[test]
fn create_context_is_called_fresh_once_per_example() {
    let seen: Rc<RefCell<Vec<Value>>> = Rc::new(RefCell::new(Vec::new()));
    let seen2 = seen.clone();
    let r = reg(
        "I record ctx",
        "s.ts",
        1,
        Handler::sync0(move |state| {
            seen2.borrow_mut().push(state.clone());
            Ok(Some(state))
        }),
        Some(StepKind::Stimulus),
    );
    let p = plan_of("# A\n\nI record ctx\n\n# B\n\nI record ctx", &r);
    let calls = Rc::new(RefCell::new(0));
    let calls2 = calls.clone();
    let create: ContextFactory = Box::new(move |_file: &str| {
        *calls2.borrow_mut() += 1;
        Rc::new(Value::from(format!("init{}", calls2.borrow()))) as Rc<dyn Any>
    });
    let ports = ExecutePorts {
        reporter: Box::new(|_| {}),
        create_context: Some(create),
        observer: None,
    };
    for q in collect_examples(&p, &ports) {
        q.run().unwrap();
    }
    assert_eq!(2, *calls.borrow());
    assert_eq!(vec![Value::from("init1"), Value::from("init2")], *seen.borrow());
}

#[test]
fn state_is_threaded_across_steps_sharing_the_same_file_no_new_context_per_step() {
    let seen: Rc<RefCell<Vec<Value>>> = Rc::new(RefCell::new(Vec::new()));
    let seen2 = seen.clone();
    let r = create_registry();
    let r = add_step(
        &r,
        "I seed",
        "s.ts",
        1,
        Handler::sync0(|_s| Ok(Some(Value::from("seeded")))),
        Some(StepKind::Stimulus),
    )
    .unwrap();
    let r = add_step(
        &r,
        "I record ctx",
        "s.ts",
        2,
        Handler::sync0(move |state| {
            seen2.borrow_mut().push(state.clone());
            Ok(Some(state))
        }),
        Some(StepKind::Stimulus),
    )
    .unwrap();
    let p = plan_of("# A\n\nI seed\nI record ctx", &r);
    let calls = Rc::new(RefCell::new(0));
    let calls2 = calls.clone();
    let create: ContextFactory = Box::new(move |_file: &str| {
        *calls2.borrow_mut() += 1;
        Rc::new(Value::from("unseeded")) as Rc<dyn Any>
    });
    let ports = ExecutePorts {
        reporter: Box::new(|_| {}),
        create_context: Some(create),
        observer: None,
    };
    collect_examples(&p, &ports)[0].run().unwrap();
    assert_eq!(1, *calls.borrow());
    assert_eq!(vec![Value::from("seeded")], *seen.borrow());
}

// -----------------------------------------------------------------------------
// Trailing data table / doc string as the last handler argument
// -----------------------------------------------------------------------------

#[test]
fn a_data_table_attached_to_a_context_step_is_appended_as_the_last_handler_argument() {
    let captured: Rc<RefCell<Vec<Value>>> = Rc::new(RefCell::new(Vec::new()));
    let captured2 = captured.clone();
    let r = reg(
        "these books exist:",
        "s.ts",
        1,
        Handler::sync1(move |state, table| {
            captured2.borrow_mut().push(table);
            Ok(Some(state))
        }),
        Some(StepKind::Stimulus),
    );
    let source = "# Library\n\nthese books exist:\n\n| title  | author  |\n|--------|---------|\n| Lolita | Nabokov |\n| Anna   | Tolstoy |";
    let p = plan_of(source, &r);
    let ports = ExecutePorts::silent();
    collect_examples(&p, &ports)[0].run().unwrap();
    assert_eq!(1, captured.borrow().len());
    assert_eq!(
        Value::list(vec![
            Value::list(vec![Value::from("title"), Value::from("author")]),
            Value::list(vec![Value::from("Lolita"), Value::from("Nabokov")]),
            Value::list(vec![Value::from("Anna"), Value::from("Tolstoy")]),
        ]),
        captured.borrow()[0]
    );
}

#[test]
fn a_doc_string_attached_to_a_context_step_is_appended_as_the_last_handler_argument() {
    let captured: Rc<RefCell<Vec<Value>>> = Rc::new(RefCell::new(Vec::new()));
    let captured2 = captured.clone();
    let r = reg(
        "the receipt is:",
        "s.ts",
        1,
        Handler::sync1(move |state, body| {
            captured2.borrow_mut().push(body);
            Ok(Some(state))
        }),
        Some(StepKind::Stimulus),
    );
    let source = "# Library\n\nthe receipt is:\n\n```json\n{\"ok\": true}\n```";
    let p = plan_of(source, &r);
    let ports = ExecutePorts::silent();
    collect_examples(&p, &ports)[0].run().unwrap();
    assert_eq!(vec![Value::from("{\"ok\": true}\n")], *captured.borrow());
}

// -----------------------------------------------------------------------------
// Header-bound table: one example per row, row map as the trailing sensor arg
// -----------------------------------------------------------------------------

const YAHTZEE: &str = "# Yahtzee\n\neach row lists the dice, the category and the score:\n\n| dice          | category   | score |\n| ------------- | ---------- | ----- |\n| 3, 3, 3, 4, 4 | full house | 17    |\n| 3, 3, 3, 3, 3 | Yahtzee    | 50    |";

#[test]
fn header_bound_table_runs_once_per_row_named_by_its_cells_passing_the_row_map() {
    let rows: Rc<RefCell<Vec<Value>>> = Rc::new(RefCell::new(Vec::new()));
    let rows2 = rows.clone();
    let r = reg(
        "each row lists the dice, the category and the score",
        "s.ts",
        1,
        Handler::sync1(move |_state, row| {
            rows2.borrow_mut().push(row.clone());
            Ok(Some(row))
        }),
        Some(StepKind::Sensor),
    );
    let p = plan_of(YAHTZEE, &r);
    let ports = ExecutePorts::silent();
    let queued = collect_examples(&p, &ports);
    let names: Vec<String> = queued.iter().map(|q| q.name.clone()).collect();
    assert_eq!(
        vec![
            "3, 3, 3, 4, 4 / full house / 17".to_string(),
            "3, 3, 3, 3, 3 / Yahtzee / 50".to_string()
        ],
        names
    );
    for q in &queued {
        q.run().unwrap();
    }
    assert_eq!(
        vec![
            vmap(vec![
                ("dice", Value::from("3, 3, 3, 4, 4")),
                ("category", Value::from("full house")),
                ("score", Value::from("17"))
            ]),
            vmap(vec![
                ("dice", Value::from("3, 3, 3, 3, 3")),
                ("category", Value::from("Yahtzee")),
                ("score", Value::from("50"))
            ]),
        ],
        *rows.borrow()
    );
}

#[test]
fn a_mismatching_header_bound_row_throws_cell_mismatch_at_the_cell_span() {
    let r = reg(
        "each row lists the dice, the category and the score",
        "s.ts",
        1,
        Handler::sync1(|_state, row| {
            let m = match &row {
                Value::Map(m) => m.clone(),
                _ => panic!("expected map"),
            };
            let get = |k: &str| m.get(k).cloned().unwrap_or(Value::Null);
            let score = match m.get("score") {
                Some(Value::String(s)) => s.clone(),
                _ => String::new(),
            };
            let score_out = if score == "50" {
                "999".to_string()
            } else {
                score
            };
            Ok(Some(vmap(vec![
                ("dice", get("dice")),
                ("category", get("category")),
                ("score", Value::from(score_out)),
            ])))
        }),
        Some(StepKind::Sensor),
    );
    let p = plan_of(YAHTZEE, &r);
    let ports = ExecutePorts::silent();
    let queued = collect_examples(&p, &ports);
    assert!(queued[0].run().is_ok()); // 17 -> unchanged -> passes
    let err = queued[1].run().unwrap_err();
    let StepError::CellMismatch(cells) = &err.error else {
        panic!("expected cell mismatch")
    };
    assert_eq!(1, cells.len());
    assert_eq!("score", cells[0].column);
    assert_eq!("50", cells[0].expected);
    assert_eq!("999", cells[0].actual);
    let source = &p.var_doc.source;
    assert_eq!("50", utf16_slice(source, cells[0].span.start_offset, cells[0].span.end_offset));
}

// -----------------------------------------------------------------------------
// Whole-table sensor (0 captures, table attached)
// -----------------------------------------------------------------------------

const UPPERCASE_TABLE: &str = "# T\n\nuppercase each one:\n\n| before | after |\n| ------ | ----- |\n| var    | VAR   |\n| bdd    | BDD   |";

#[test]
fn a_whole_table_sensor_returning_a_mismatched_table_throws_cell_mismatch_at_the_cell_span() {
    let r = reg(
        "uppercase each one",
        "s.ts",
        1,
        Handler::sync1(|_s, _t| {
            Ok(Some(Value::list(vec![
                Value::list(vec![Value::from("var"), Value::from("WRONG")]),
                Value::list(vec![Value::from("bdd"), Value::from("BDD")]),
            ])))
        }),
        Some(StepKind::Sensor),
    );
    let p = plan_of(UPPERCASE_TABLE, &r);
    let ports = ExecutePorts::silent();
    let err = collect_examples(&p, &ports)[0].run().unwrap_err();
    let StepError::CellMismatch(cells) = &err.error else {
        panic!("expected cell mismatch")
    };
    assert_eq!(1, cells.len());
    assert_eq!("VAR", cells[0].expected);
    assert_eq!("WRONG", cells[0].actual);
}

#[test]
fn a_whole_table_sensor_returning_a_matching_table_passes() {
    let r = reg(
        "uppercase each one",
        "s.ts",
        1,
        Handler::sync1(|_s, _t| {
            Ok(Some(Value::list(vec![
                vmap(vec![
                    ("before", Value::from("var")),
                    ("after", Value::from("VAR")),
                ]),
                vmap(vec![
                    ("before", Value::from("bdd")),
                    ("after", Value::from("BDD")),
                ]),
            ])))
        }),
        Some(StepKind::Sensor),
    );
    let p = plan_of(UPPERCASE_TABLE, &r);
    let ports = ExecutePorts::silent();
    assert!(collect_examples(&p, &ports)[0].run().is_ok());
}

#[test]
fn a_whole_table_sensor_returning_the_wrong_type_throws_return_shape() {
    let r = reg(
        "uppercase each one",
        "s.ts",
        1,
        Handler::sync1(|_s, _t| Ok(Some(Value::from("not a table")))),
        Some(StepKind::Sensor),
    );
    let p = plan_of(UPPERCASE_TABLE, &r);
    let ports = ExecutePorts::silent();
    assert!(matches!(
        collect_examples(&p, &ports)[0].run().unwrap_err().error,
        StepError::ReturnShape(_)
    ));
}

// -----------------------------------------------------------------------------
// Doc-string sensor (0 captures, doc string attached)
// -----------------------------------------------------------------------------

const GREETING_DOC: &str = "# T\n\nthe greeting is:\n\n```text\nHello, world!\n```";

#[test]
fn a_doc_string_sensor_returning_a_different_string_throws_cell_mismatch_at_the_body_span() {
    let r = reg(
        "the greeting is",
        "s.ts",
        1,
        Handler::sync1(|_s, _b| Ok(Some(Value::from("Goodbye!\n")))),
        Some(StepKind::Sensor),
    );
    let p = plan_of(GREETING_DOC, &r);
    let ports = ExecutePorts::silent();
    let err = collect_examples(&p, &ports)[0].run().unwrap_err();
    let StepError::CellMismatch(cells) = &err.error else {
        panic!("expected a cell mismatch")
    };
    let diff = &cells[0];
    assert_eq!("doc string", diff.column);
    // Quoted, so a whitespace-only difference stays visible.
    assert_eq!("\"Hello, world!\\n\"", diff.expected);
    assert_eq!("\"Goodbye!\\n\"", diff.actual);
}

#[test]
fn a_doc_string_sensor_returning_the_exact_body_passes() {
    let r = reg(
        "the greeting is",
        "s.ts",
        1,
        Handler::sync1(|_s, body| Ok(Some(body))),
        Some(StepKind::Sensor),
    );
    let p = plan_of(GREETING_DOC, &r);
    let ports = ExecutePorts::silent();
    assert!(collect_examples(&p, &ports)[0].run().is_ok());
}

// -----------------------------------------------------------------------------
// error-fence convention: inverts outcome
// -----------------------------------------------------------------------------

#[test]
fn error_fence_example_where_the_step_throws_a_matching_message_passes() {
    let r = reg(
        "I divide {int} by {int}",
        "s.ts",
        1,
        Handler::sync2(|state, _a, b| {
            if int_of(&b) == 0 {
                Err(HandlerError::new("division by zero"))
            } else {
                Ok(Some(state))
            }
        }),
        Some(StepKind::Stimulus),
    );
    let src = "# D\n\nI divide 1 by 0.\n\n```error\ndivision by zero\n```\n";
    let p = plan_of(src, &r);
    let ports = ExecutePorts::silent();
    assert!(collect_examples(&p, &ports)[0].run().is_ok());
}

#[test]
fn error_fence_example_where_no_throw_throws_unexpected_pass() {
    let r = reg(
        "I divide {int} by {int}",
        "s.ts",
        1,
        Handler::sync2(|state, _a, _b| Ok(Some(state))),
        Some(StepKind::Stimulus),
    );
    let src = "# D\n\nI divide 1 by 1.\n\n```error\n```\n";
    let p = plan_of(src, &r);
    let ports = ExecutePorts::silent();
    assert!(matches!(
        collect_examples(&p, &ports)[0].run().unwrap_err().error,
        StepError::UnexpectedPass
    ));
}

#[test]
fn error_fence_example_with_mismatching_message_rethrows_the_real_error() {
    let r = reg(
        "I divide {int} by {int}",
        "s.ts",
        1,
        Handler::sync2(|_s, _a, _b| Err(HandlerError::new("boom"))),
        Some(StepKind::Stimulus),
    );
    let src = "# D\n\nI divide 1 by 0.\n\n```error\ndivision by zero\n```\n";
    let p = plan_of(src, &r);
    let ports = ExecutePorts::silent();
    let err = collect_examples(&p, &ports)[0].run().unwrap_err();
    assert_eq!("boom", err.error.message());
}

// -----------------------------------------------------------------------------
// Return-vs-throw parity: a panicking (assertion-style) sensor
// -----------------------------------------------------------------------------

#[test]
fn a_sensor_that_panics_instead_of_returning_a_mismatch_gets_a_located_failure() {
    let r = reg(
        "the total should be {int}",
        "s.ts",
        1,
        Handler::sync1(|_s, expected| {
            panic!("expected {} but was 41", int_of(&expected));
        }),
        Some(StepKind::Sensor),
    );
    let p = plan_of("# Q\n\nthe total should be 42.", &r);
    let step_line = p.examples[0].steps[0].match_span.start_line;
    let ports = ExecutePorts::silent();
    let caught = collect_examples(&p, &ports)[0].run().unwrap_err();
    assert_eq!("expected 42 but was 41", caught.error.message());
    let failure = to_failure(&caught, &p.var_doc.path, -1);
    assert_eq!(step_line as i64, failure.line);
}

#[test]
fn an_error_fence_example_where_the_step_panics_matching_the_expected_message_passes() {
    let r = reg(
        "the total should be {int}",
        "s.ts",
        1,
        Handler::sync1(|_s, _e| panic!("boom")),
        Some(StepKind::Sensor),
    );
    let src = "# Q\n\nthe total should be 42.\n\n```error\nboom\n```\n";
    let p = plan_of(src, &r);
    let ports = ExecutePorts::silent();
    assert!(collect_examples(&p, &ports)[0].run().is_ok());
}

#[test]
fn observer_receives_a_fail_observation_when_a_sensor_panics() {
    let r = reg(
        "the total should be {int}",
        "s.ts",
        1,
        Handler::sync1(|_s, _e| panic!("boom")),
        Some(StepKind::Sensor),
    );
    let p = plan_of("# Q\n\nthe total should be 42.", &r);
    let obs: Rc<RefCell<Vec<StepObservation>>> = Rc::new(RefCell::new(Vec::new()));
    let obs2 = obs.clone();
    let ports = ExecutePorts {
        reporter: Box::new(|_| {}),
        create_context: None,
        observer: Some(Box::new(move |o| obs2.borrow_mut().push(o))),
    };
    assert!(collect_examples(&p, &ports)[0].run().is_err());
    assert_eq!(1, obs.borrow().len());
    assert_eq!(StepOutcome::Fail, obs.borrow()[0].outcome);
    assert!(obs.borrow()[0].error.is_some());
}

// -----------------------------------------------------------------------------
// Observer
// -----------------------------------------------------------------------------

#[test]
fn observer_receives_a_pass_observation_per_executed_step() {
    let r = reg(
        "I add {int}",
        "s.ts",
        1,
        Handler::sync1(|state, _n| Ok(Some(state))),
        Some(StepKind::Stimulus),
    );
    let p = plan_of("# A\n\nI add 5.", &r);
    let obs: Rc<RefCell<Vec<StepObservation>>> = Rc::new(RefCell::new(Vec::new()));
    let obs2 = obs.clone();
    let ports = ExecutePorts {
        reporter: Box::new(|_| {}),
        create_context: None,
        observer: Some(Box::new(move |o| obs2.borrow_mut().push(o))),
    };
    collect_examples(&p, &ports)[0].run().unwrap();
    assert_eq!(
        vec![StepObservation {
            example_index: 0,
            ordinal: 1,
            outcome: StepOutcome::Pass,
            error: None
        }],
        *obs.borrow()
    );
}

#[test]
fn observer_receives_a_fail_observation_when_a_step_throws() {
    let r = reg(
        "I blow up",
        "s.ts",
        1,
        Handler::sync0(|_s| Err(HandlerError::new("kaboom"))),
        Some(StepKind::Stimulus),
    );
    let p = plan_of("# A\n\nI blow up.", &r);
    let obs: Rc<RefCell<Vec<StepObservation>>> = Rc::new(RefCell::new(Vec::new()));
    let obs2 = obs.clone();
    let ports = ExecutePorts {
        reporter: Box::new(|_| {}),
        create_context: None,
        observer: Some(Box::new(move |o| obs2.borrow_mut().push(o))),
    };
    assert!(collect_examples(&p, &ports)[0].run().is_err());
    assert_eq!(1, obs.borrow().len());
    assert_eq!(0, obs.borrow()[0].example_index);
    assert_eq!(1, obs.borrow()[0].ordinal);
    assert_eq!(StepOutcome::Fail, obs.borrow()[0].outcome);
    assert!(obs.borrow()[0].error.is_some());
}

// -----------------------------------------------------------------------------
// Failure location integration
// -----------------------------------------------------------------------------

#[test]
fn a_thrown_step_gets_a_located_failure_that_failure_to_failure_resolves_to_the_md_line() {
    let r = reg(
        "I throw",
        "s.ts",
        1,
        Handler::sync0(|_s| Err(HandlerError::new("boom"))),
        Some(StepKind::Stimulus),
    );
    let p = plan_of("# A\n\nI throw", &r);
    let step_line = p.examples[0].steps[0].match_span.start_line;
    let ports = ExecutePorts::silent();
    let caught = collect_examples(&p, &ports)[0].run().unwrap_err();
    assert_eq!("boom", caught.error.message());
    let failure = to_failure(&caught, &p.var_doc.path, -1);
    assert_eq!(step_line as i64, failure.line);
    assert_eq!("boom", failure.message);
}

// -----------------------------------------------------------------------------
// Async: handlers may return a Future, sync or failing
// -----------------------------------------------------------------------------

#[test]
fn an_action_handler_returning_a_future_is_awaited_and_its_result_becomes_the_new_state() {
    let seen: Rc<RefCell<Vec<Value>>> = Rc::new(RefCell::new(Vec::new()));
    let seen2 = seen.clone();
    let r = create_registry();
    let r = add_step(
        &r,
        "I greet asynchronously",
        "s.ts",
        1,
        Handler::async0(|_state| {
            Box::pin(YieldOnce {
                value: Some(Ok(StepOutput::Compared(Some(Value::from("hi"))))),
                yielded: false,
            })
        }),
        Some(StepKind::Stimulus),
    )
    .unwrap();
    let r = add_step(
        &r,
        "observe",
        "s.ts",
        2,
        Handler::sync0(move |state| {
            seen2.borrow_mut().push(state);
            Ok(None)
        }),
        Some(StepKind::Sensor),
    )
    .unwrap();
    let p = plan_of("# A\n\nI greet asynchronously\nobserve", &r);
    let ports = ExecutePorts::silent();
    collect_examples(&p, &ports)[0].run().unwrap();
    assert_eq!(vec![Value::from("hi")], *seen.borrow());
}

#[test]
fn an_async_handler_that_completes_exceptionally_propagates_its_cause() {
    let r = reg(
        "I fail asynchronously",
        "s.ts",
        1,
        Handler::async0(|_state| Box::pin(async { Err(HandlerError::new("async boom")) })),
        Some(StepKind::Stimulus),
    );
    let p = plan_of("# A\n\nI fail asynchronously", &r);
    let ports = ExecutePorts::silent();
    let err = collect_examples(&p, &ports)[0].run().unwrap_err();
    assert_eq!("async boom", err.error.message());
}

// -----------------------------------------------------------------------------
// executePlan: eager, fail-fast run-everything driver
// -----------------------------------------------------------------------------

#[test]
fn execute_plan_runs_every_example_when_none_fail() {
    let ran: Rc<RefCell<Vec<String>>> = Rc::new(RefCell::new(Vec::new()));
    let ran2 = ran.clone();
    let r = reg(
        "I run",
        "s.ts",
        1,
        Handler::sync0(move |state| {
            ran2.borrow_mut().push("ran".to_string());
            Ok(Some(state))
        }),
        Some(StepKind::Stimulus),
    );
    let p = plan_of("# A\n\nI run\n\n# B\n\nI run", &r);
    let ports = ExecutePorts::silent();
    assert!(execute_plan(&p, &ports).is_ok());
    assert_eq!(vec!["ran".to_string(), "ran".to_string()], *ran.borrow());
}

#[test]
fn execute_plan_propagates_the_first_failure_and_does_not_run_subsequent_examples() {
    let second_ran = Rc::new(RefCell::new(false));
    let second_ran2 = second_ran.clone();
    let r = create_registry();
    let r = add_step(
        &r,
        "I fail",
        "s.ts",
        1,
        Handler::sync0(|_s| Err(HandlerError::new("boom"))),
        Some(StepKind::Stimulus),
    )
    .unwrap();
    let r = add_step(
        &r,
        "I succeed",
        "s.ts",
        2,
        Handler::sync0(move |state| {
            *second_ran2.borrow_mut() = true;
            Ok(Some(state))
        }),
        Some(StepKind::Stimulus),
    )
    .unwrap();
    let p = plan_of("# A\n\nI fail\n\n# B\n\nI succeed", &r);
    let ports = ExecutePorts::silent();
    assert!(execute_plan(&p, &ports).is_err());
    assert!(!*second_ran.borrow());
}

// -----------------------------------------------------------------------------
// Wiring: a null step kind is an error; invocation isn't tied to any interface
// -----------------------------------------------------------------------------

#[test]
fn a_null_step_kind_throws_a_return_shape() {
    let r = reg("I do a thing", "s.ts", 1, Handler::sync0(|state| Ok(Some(state))), None);
    let p = plan_of("# A\n\nI do a thing", &r);
    let ports = ExecutePorts::silent();
    assert!(matches!(
        collect_examples(&p, &ports)[0].run().unwrap_err().error,
        StepError::ReturnShape(_)
    ));
}

#[test]
fn handler_invocation_works_for_any_closure_shape() {
    let r = reg(
        "I use a plain closure",
        "s.ts",
        1,
        Handler::sync0(|_state| Ok(Some(Value::from("ok")))),
        Some(StepKind::Stimulus),
    );
    let p = plan_of("# A\n\nI use a plain closure", &r);
    let ports = ExecutePorts::silent();
    assert!(collect_examples(&p, &ports)[0].run().is_ok());
}

// -----------------------------------------------------------------------------
// Variadic handlers: sync_var / async_var (any-arity escape hatch — Java
// reflective invocation / Python *args parity)
// -----------------------------------------------------------------------------

#[test]
fn a_three_slot_step_runs_through_a_sync_var_handler() {
    // Two inline params + a trailing table = three slots, beyond sync2.
    let seen: Rc<RefCell<Vec<usize>>> = Rc::new(RefCell::new(Vec::new()));
    let seen2 = seen.clone();
    let r = reg(
        "I map {word} to {word}:",
        "s.ts",
        1,
        Handler::sync_var(move |state, args| {
            seen2.borrow_mut().push(args.len());
            Ok(Some(state))
        }),
        Some(StepKind::Stimulus),
    );
    let source = "# M\n\nI map alpha to beta:\n\n| from | to |\n|------|----|\n| a    | b  |";
    let p = plan_of(source, &r);
    let ports = ExecutePorts::silent();
    collect_examples(&p, &ports)[0].run().unwrap();
    assert_eq!(vec![3], *seen.borrow()); // word, word, table
}

#[test]
fn an_async_handler_with_parameters_runs_through_async_var() {
    let r = create_registry();
    let r = add_step(
        &r,
        "I greet {string} asynchronously",
        "s.ts",
        1,
        Handler::async_var(|_state, args| {
            Box::pin(async move {
                let name = match &args[0] {
                    Value::String(s) => s.clone(),
                    _ => String::new(),
                };
                Ok(StepOutput::Compared(Some(Value::from(format!("hi {name}")))))
            })
        }),
        Some(StepKind::Stimulus),
    )
    .unwrap();
    let r = add_step(
        &r,
        "observe greeting",
        "s.ts",
        2,
        Handler::sync0(|state| {
            assert_eq!(Value::from("hi world"), state);
            Ok(None)
        }),
        Some(StepKind::Sensor),
    )
    .unwrap();
    let p = plan_of("# A\n\nI greet \"world\" asynchronously\nobserve greeting", &r);
    let ports = ExecutePorts::silent();
    collect_examples(&p, &ports)[0].run().unwrap();
}
