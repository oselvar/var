//! Steps for `library.md`.
//!
//! Custom parameter types pair `parse` with `format`, so a mismatch renders in
//! the document's own notation (money, dates, an emphasised title). Money is
//! encoded as pennies (`Value::Int`), a date as a `{year, month, day}` map, and
//! a title as its bare text (`Value::String`) — see [`crate::library_example`].

use super::{as_int, smap, vmap};
use crate::library_example::{
    Date, FEE_PER_DAY, format_date, format_money, late_fee, may_borrow, parse_date, parse_money,
};
use std::rc::Rc;
use var_core::handler::Handler;
use var_core::registry::{
    FormatFn, ParseFn, Registry, add_step, define_parameter_type_with_format,
};
use var_core::step_kind::StepKind;
use var_core::value::Value;

pub const FILE: &str = "library.steps";

fn date_value(d: Date) -> Value {
    vmap(vec![
        ("year", Value::Int(d.year)),
        ("month", Value::Int(d.month)),
        ("day", Value::Int(d.day)),
    ])
}

fn value_date(v: &Value) -> Date {
    let m = smap(v);
    Date {
        year: as_int(&m["year"]),
        month: as_int(&m["month"]),
        day: as_int(&m["day"]),
    }
}

fn loan_due(loan: &Value) -> Date {
    value_date(&smap(loan)["due"])
}

fn loans_of(state: &Value) -> Vec<Value> {
    match smap(state).get("loans") {
        Some(Value::List(l)) => l.clone(),
        _ => Vec::new(),
    }
}

pub fn register(r: Registry) -> Registry {
    // --- custom parameter types (parse + display format) --------------------

    let date_parse: ParseFn = Rc::new(|g: &[&str]| date_value(parse_date(g[0])));
    let date_format: FormatFn = Rc::new(|v: &Value| Some(format_date(value_date(v))));
    let r = define_parameter_type_with_format(
        &r,
        "date",
        r"[A-Z][a-z]+ \d{1,2}, \d{4}",
        date_parse,
        date_format,
    );

    // £2.50 and 50p, both as pennies. var-core's matcher compiles with the
    // `regex` crate, which has no lookahead — so this is the corpus-covering
    // subset of cucumber-expressions' float regexp (no scientific notation, no
    // empty-match guards), not the exact Python pattern.
    let money_parse: ParseFn = Rc::new(|g: &[&str]| Value::Int(parse_money(g[0])));
    let money_format: FormatFn = Rc::new(|v: &Value| match v {
        Value::Int(pennies) => Some(format_money(*pennies)),
        _ => None,
    });
    let r = define_parameter_type_with_format(
        &r,
        "money",
        r"£\d+(?:\.\d+)?|\d+p",
        money_parse,
        money_format,
    );

    // The emphasised run IS the parameter: the markers live in the pattern,
    // parse strips them, format restores them. Markup is notation, like £2.50.
    let title_parse: ParseFn = Rc::new(|g: &[&str]| {
        let raw = g[0];
        let inner = raw
            .strip_prefix('*')
            .and_then(|s| s.strip_suffix('*'))
            .unwrap_or(raw);
        Value::from(inner.to_string())
    });
    let title_format: FormatFn = Rc::new(|v: &Value| match v {
        Value::String(t) => Some(format!("*{t}*")),
        _ => None,
    });
    let r = define_parameter_type_with_format(&r, "title", r"\*[^*]+\*", title_parse, title_format);

    // --- steps --------------------------------------------------------------

    let r = add_step(
        &r,
        "borrowed {title}, due back on {date}",
        FILE,
        1,
        Handler::sync2(|state, title, due| {
            let mut m = smap(&state);
            let mut loans = loans_of(&state);
            loans.push(vmap(vec![("title", title), ("due", due)]));
            m.insert("loans".to_string(), Value::List(loans));
            Ok(Some(Value::Map(m)))
        }),
        Some(StepKind::Stimulus),
    )
    .unwrap();

    let r = add_step(
        &r,
        "returns it on {date}",
        FILE,
        5,
        Handler::sync1(|state, returned_on| {
            let returned = value_date(&returned_on);
            let mut fee = 0;
            for loan in loans_of(&state) {
                fee += late_fee(loan_due(&loan), returned);
            }
            let mut m = smap(&state);
            m.insert("fee".to_string(), Value::Int(fee));
            Ok(Some(Value::Map(m)))
        }),
        Some(StepKind::Stimulus),
    )
    .unwrap();

    let r = add_step(
        &r,
        "owes a {money} late fee",
        FILE,
        10,
        Handler::sync1(|state, _expected| Ok(smap(&state).get("fee").cloned())),
        Some(StepKind::Sensor),
    )
    .unwrap();

    let r = add_step(
        &r,
        "{money} for each day overdue",
        FILE,
        14,
        Handler::sync1(|_state, _expected| Ok(Some(Value::Int(FEE_PER_DAY)))),
        Some(StepKind::Sensor),
    )
    .unwrap();

    let r = add_step(
        &r,
        "asks to borrow {title} on {date}",
        FILE,
        18,
        Handler::sync2(|state, _title, on| {
            let on = value_date(&on);
            let dues: Vec<Date> = loans_of(&state).iter().map(loan_due).collect();
            let mut m = smap(&state);
            m.insert("granted".to_string(), Value::Bool(may_borrow(&dues, on)));
            Ok(Some(Value::Map(m)))
        }),
        Some(StepKind::Stimulus),
    )
    .unwrap();

    let r = add_step(
        &r,
        "the library refuses",
        FILE,
        24,
        Handler::sync0(|state| {
            if matches!(smap(&state).get("granted"), Some(Value::Bool(true))) {
                panic!("expected the library to refuse");
            }
            Ok(None)
        }),
        Some(StepKind::Sensor),
    )
    .unwrap();

    add_step(
        &r,
        "the library agrees",
        FILE,
        30,
        Handler::sync0(|state| {
            if !matches!(smap(&state).get("granted"), Some(Value::Bool(true))) {
                panic!("expected the library to agree");
            }
            Ok(None)
        }),
        Some(StepKind::Sensor),
    )
    .unwrap()
}
