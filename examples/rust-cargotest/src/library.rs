//! The code under test for `library.md`: pure domain logic over `NaiveDate` and
//! [`Money`]. The document's notation — "June 1, 2026", "50p", "£2.50" — is not
//! this module's business: parsing and formatting live with the step
//! definitions (`src/steps/library.steps.rs`), the same split every other port
//! makes.

use chrono::NaiveDate;

/// An amount in a single currency — mirrors the TypeScript sample's `Money`.
/// The currency is a `&'static str` so [`FEE_PER_DAY`] can be a `const`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Money {
    pub currency: &'static str,
    pub value: f64,
}

/// The only currency this sample deals in.
pub const GBP: &str = "GBP";

/// Pounds sterling.
pub const fn gbp(value: f64) -> Money {
    Money {
        currency: GBP,
        value,
    }
}

/// The overdue fee: 50p a day.
pub const FEE_PER_DAY: Money = gbp(0.5);

impl Default for Money {
    fn default() -> Money {
        gbp(0.0)
    }
}

/// Adding across currencies is a domain error, not an arithmetic one.
pub fn add_money(a: Money, b: Money) -> Result<Money, String> {
    if a.currency != b.currency {
        return Err(format!("cannot add {} to {}", b.currency, a.currency));
    }
    Ok(Money {
        currency: a.currency,
        value: a.value + b.value,
    })
}

/// One borrowed title and the day it is due back.
#[derive(Clone, Debug)]
pub struct Loan {
    pub title: String,
    pub due: NaiveDate,
}

pub fn late_fee(loan: &Loan, returned_on: NaiveDate) -> Money {
    let days_late = (returned_on - loan.due).num_days().max(0);
    gbp(days_late as f64 * FEE_PER_DAY.value)
}

pub fn may_borrow(loans: &[Loan], on: NaiveDate) -> bool {
    loans.iter().all(|loan| loan.due >= on)
}

// Slot conversions, so a `Money` can be a step parameter and a sensor return
// directly — Rust has no reflection, so a domain type says once how it maps to
// and from a slot.
impl varar::ToSlot for Money {
    fn to_slot(&self) -> varar::Value {
        varar::Value::Map(std::collections::BTreeMap::from([
            ("currency".to_string(), varar::Value::String(self.currency.to_string())),
            ("value".to_string(), varar::Value::Float(self.value)),
        ]))
    }
}

impl varar::FromSlot for Money {
    fn from_slot(value: &varar::Value) -> Result<Money, varar::HandlerError> {
        let varar::Value::Map(m) = value else {
            return Err(varar::HandlerError::new("expected an amount of money"));
        };
        let Some(varar::Value::Float(value)) = m.get("value") else {
            return Err(varar::HandlerError::new("money is missing a value"));
        };
        match m.get("currency") {
            Some(varar::Value::String(c)) if c == GBP => Ok(gbp(*value)),
            _ => Err(varar::HandlerError::new("this sample only knows GBP")),
        }
    }
}
