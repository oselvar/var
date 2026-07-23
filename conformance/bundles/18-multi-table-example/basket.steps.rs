//! Rust sibling of `basket.steps.ts` (bundle `18-multi-table-example`).
//!
//! The two Given/And paragraphs each carry a table and are separated from each
//! other by a blank line (valid GFM). They must merge into ONE example that
//! shares state, so the sensor reads back 1 user and 1 asset. The second example
//! — separated by the prose paragraph — starts from a fresh, empty basket and
//! reads back 0 and 0, proving the prose paragraph is a delimiter. See ADR 0012.

use varar::Steps;

#[derive(Clone, Default)]
pub struct Ctx {
    pub users: Vec<String>,
    pub assets: Vec<String>,
}

pub fn register(s: &mut Steps<Ctx>) {
    // A whole-table slot arrives as rows of cells; skip the header row and take
    // each row's first column.
    s.stimulus("the following users have been imported", |ctx: Ctx, table: Vec<Vec<String>>| {
        Ok(Ctx {
            users: table.iter().skip(1).map(|row| row[0].clone()).collect(),
            ..ctx
        })
    });
    s.stimulus("the following assets have been imported", |ctx: Ctx, table: Vec<Vec<String>>| {
        Ok(Ctx {
            assets: table.iter().skip(1).map(|row| row[0].clone()).collect(),
            ..ctx
        })
    });
    s.sensor(
        "the basket contains {int} user(s) and {int} asset(s)",
        |ctx: Ctx, _users: i64, _assets: i64| Ok((ctx.users.len() as i64, ctx.assets.len() as i64)),
    );
}

pub fn state() -> Ctx {
    Ctx::default()
}
