//! The library domain (the `library.md` domain): loans, late fees and the
//! borrow rule. A port of `examples/python-pytest/src/library_example`.
//!
//! Money is carried as whole **pennies** (`i64`) rather than a `Money` value
//! type: varar-core's dynamic [`Value`](varar_core::value::Value) is a closed enum,
//! so — unlike the Python/Java ports, which hold a `Money`/`date` object in the
//! threaded state — the Rust steps encode money as an integer and dates as a
//! `{year, month, day}` map. The GBP currency is implicit.

/// Late fee per day overdue, in pennies (Python `FEE_PER_DAY = gbp(0.5)`).
pub const FEE_PER_DAY: i64 = 50;

const MONTHS: [&str; 12] = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

/// A calendar date. Comparison and day-arithmetic go through [`Date::serial`].
#[derive(Clone, Copy, PartialEq, Eq)]
pub struct Date {
    pub year: i64,
    pub month: i64,
    pub day: i64,
}

impl Date {
    /// Days since 1970-01-01 (Howard Hinnant's `days_from_civil`); only the
    /// difference between two serials is ever used, so the epoch is arbitrary.
    pub fn serial(self) -> i64 {
        let (y, m, d) = (self.year, self.month, self.day);
        let y = if m <= 2 { y - 1 } else { y };
        let era = (if y >= 0 { y } else { y - 399 }) / 400;
        let yoe = y - era * 400; // [0, 399]
        let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1; // [0, 365]
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy; // [0, 146096]
        era * 146097 + doe - 719468
    }
}

/// `June 6, 2026` → `Date { 2026, 6, 6 }`.
pub fn parse_date(raw: &str) -> Date {
    let (month_day, year) = raw
        .split_once(", ")
        .unwrap_or_else(|| panic!("not a date: {raw}"));
    let (month, day) = month_day
        .split_once(' ')
        .unwrap_or_else(|| panic!("not a date: {raw}"));
    let month = MONTHS
        .iter()
        .position(|m| *m == month)
        .unwrap_or_else(|| panic!("not a month: {month}")) as i64
        + 1;
    Date {
        year: year.parse().expect("year"),
        month,
        day: day.parse().expect("day"),
    }
}

/// The inverse of [`parse_date`]: `Date { 2026, 6, 6 }` → `June 6, 2026`.
pub fn format_date(d: Date) -> String {
    format!("{} {}, {}", MONTHS[(d.month - 1) as usize], d.day, d.year)
}

/// `£2.50` → `250`, `50p` → `50` (both in pennies).
pub fn parse_money(raw: &str) -> i64 {
    if let Some(pence) = raw.strip_suffix('p') {
        pence.parse().expect("pence")
    } else if let Some(pounds) = raw.strip_prefix('£') {
        (pounds.parse::<f64>().expect("pounds") * 100.0).round() as i64
    } else {
        panic!("not money: {raw}")
    }
}

/// The inverse of [`parse_money`]: mismatches render as `£2.60` / `50p`, never
/// as a raw integer.
pub fn format_money(pennies: i64) -> String {
    if pennies < 100 {
        format!("{pennies}p")
    } else {
        format!("£{:.2}", pennies as f64 / 100.0)
    }
}

/// Fee for returning a loan: 50p per day past the due date.
pub fn late_fee(due: Date, returned_on: Date) -> i64 {
    let days_late = (returned_on.serial() - due.serial()).max(0);
    days_late * FEE_PER_DAY
}

/// A member may borrow as long as none of their loans is overdue.
pub fn may_borrow(dues: &[Date], on: Date) -> bool {
    dues.iter().all(|due| due.serial() >= on.serial())
}
