use super::Ctx;
use crate::library::{FEE_PER_DAY, Loan, Money, add_money, gbp, late_fee, may_borrow};
use chrono::NaiveDate;
use varar::{HandlerError, Steps};

/// The document's date notation, e.g. "June 1, 2026". `%-d` drops the zero
/// padding on the day; chrono's parser ignores padding, so one format string
/// serves both directions.
const DATE_FORMAT: &str = "%B %-d, %Y";

/// A `NaiveDate` at the slot boundary. Both `NaiveDate` and `FromSlot` are
/// foreign to this crate, so the orphan rule needs a newtype here; it carries no
/// domain behaviour — the library itself speaks plain `NaiveDate` (see
/// `src/library.rs`).
#[derive(Clone, Copy)]
pub struct Date(NaiveDate);

impl varar::ToSlot for Date {
    fn to_slot(&self) -> varar::Value {
        varar::Value::String(self.0.format(DATE_FORMAT).to_string())
    }
}

impl varar::FromSlot for Date {
    fn from_slot(value: &varar::Value) -> Result<Date, HandlerError> {
        let varar::Value::String(raw) = value else {
            return Err(HandlerError::new("expected a date"));
        };
        NaiveDate::parse_from_str(raw, DATE_FORMAT)
            .map(Date)
            .map_err(|e| HandlerError::new(format!("not a date: {raw} ({e})")))
    }
}

/// Money notation is spec prose, so it is read and rendered here — the code
/// under test only ever sees [`Money`]. Under £1 renders as "50p", otherwise as
/// "£2.55".
fn to_money(raw: &str) -> Money {
    match raw.strip_suffix('p') {
        Some(pence) => gbp(pence.parse::<f64>().expect("pence") / 100.0),
        None => gbp(raw
            .strip_prefix('£')
            .expect("money")
            .parse::<f64>()
            .expect("pounds")),
    }
}

fn format_money(m: &Money) -> String {
    if m.value < 1.0 {
        format!("{}p", (m.value * 100.0).round() as i64)
    } else {
        format!("£{:.2}", m.value)
    }
}

pub fn register(s: &mut Steps<Ctx>) {
    // Custom parameter types, declared in terms of the Rust types they produce:
    // a date, an amount of money, and a plain title String.
    s.param(
        "date",
        r"[A-Z][a-z]+ \d{1,2}, \d{4}",
        |g: &[&str]| Date(NaiveDate::parse_from_str(g[0], DATE_FORMAT).expect("a date")),
        Some(Box::new(|d: &Date| d.0.format(DATE_FORMAT).to_string())),
    );
    // A lookahead-free regexp: the `regex` crate has no lookahead, so this drops
    // the empty-match guards of the TypeScript/Ruby pattern (same corpus).
    s.param(
        "money",
        r"£\d+(?:\.\d+)?|\d+p",
        |g: &[&str]| to_money(g[0]),
        Some(Box::new(format_money)),
    );
    s.param(
        "title",
        r"\*[^*]+\*",
        |g: &[&str]| {
            g[0].strip_prefix('*')
                .and_then(|t| t.strip_suffix('*'))
                .unwrap_or(g[0])
                .to_string()
        },
        Some(Box::new(|t: &String| format!("*{t}*"))),
    );

    s.stimulus("borrowed {title}, due back on {date}", |ctx: Ctx, title: String, due: Date| {
        let mut loans = ctx.loans.clone();
        loans.push(Loan { title, due: due.0 });
        Ok(Ctx { loans, ..ctx })
    });

    s.stimulus("returns it on {date}", |ctx: Ctx, returned: Date| {
        let fee = ctx
            .loans
            .iter()
            .map(|loan| late_fee(loan, returned.0))
            .try_fold(gbp(0.0), add_money)
            .map_err(HandlerError::new)?;
        Ok(Ctx { fee, ..ctx })
    });

    s.sensor("owes a {money} late fee", |ctx: Ctx, _expected: Money| Ok(ctx.fee));

    s.sensor("{money} for each day overdue", |_ctx: Ctx, _expected: Money| Ok(FEE_PER_DAY));

    s.stimulus("asks to borrow {title} on {date}", |ctx: Ctx, _title: String, on: Date| {
        Ok(Ctx {
            granted: may_borrow(&ctx.loans, on.0),
            ..ctx
        })
    });

    s.sensor("the library refuses", |ctx: Ctx| {
        if ctx.granted {
            return Err(HandlerError::new("expected the library to refuse"));
        }
        Ok(())
    });

    s.sensor("the library agrees", |ctx: Ctx| {
        if !ctx.granted {
            return Err(HandlerError::new("expected the library to agree"));
        }
        Ok(())
    });
}
