//! Top-level parse entry point: `scan` then `structure` — port of `parse.ts` /
//! `Parse.java`.

use crate::ast::VarDoc;
use crate::{scanner, structurer};

/// Parses `source` into a [`VarDoc`].
pub fn parse(path: &str, source: &str) -> VarDoc {
    structurer::structure(path, source, scanner::scan(source))
}
