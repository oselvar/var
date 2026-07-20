//! Step definitions for every spec, plus the registry glue.
//!
//! Rust has no import-for-side-effect story, so — like the Java/Kotlin/Go/C#
//! ports, and unlike TypeScript/Python's module-scope accumulator — each step
//! file exposes a `register(&mut Steps<Ctx>)` that adds its steps to the
//! injected builder, and [`build_registry`] threads one builder through them
//! all. The state is a **full replacement** value: a stimulus returns the whole
//! next `Ctx`.
//!
//! Note what is absent: `varar::Value`. The context is this crate's own `Ctx`,
//! and every slot arrives as the Rust type the handler declares.

use varar::{Registry, Steps};

// Step files carry the `.steps.` infix every other port's do, which Rust's
// module resolver does not derive from the module name — hence `#[path]`.
#[path = "deep_thought.steps.rs"]
pub mod deep_thought;
#[path = "hello_var.steps.rs"]
pub mod hello_var;
#[path = "library.steps.rs"]
pub mod library;
#[path = "roman_numerals.steps.rs"]
pub mod roman_numerals;
#[path = "tables_and_docstrings.steps.rs"]
pub mod tables_and_docstrings;
#[path = "yahtzee.steps.rs"]
pub mod yahtzee;

use crate::library::{Loan, Money};

/// This project's step state. `varar-core` keys it per step file, so each spec
/// starts from `Ctx::default()`.
#[derive(Clone, Default)]
pub struct Ctx {
    // hello-var
    pub greeting: String,
    pub result: i64,
    // library
    pub loans: Vec<Loan>,
    pub fee: Money,
    pub granted: bool,
}

/// The combined registry for all specs.
pub fn build_registry() -> Registry {
    let mut s = Steps::<Ctx>::new();
    hello_var::register(&mut s);
    deep_thought::register(&mut s);
    tables_and_docstrings::register(&mut s);
    yahtzee::register(&mut s);
    roman_numerals::register(&mut s);
    library::register(&mut s);
    s.into_registry()
}

/// Fresh initial state per step file. Every spec starts from `Ctx::default()`;
/// `varar-core` keys state per step file, so specs never see each other's. A
/// plain `fn` (not a closure) so the adapter can move it across the libtest
/// thread boundary.
pub fn context_value(_file: &str) -> std::rc::Rc<dyn std::any::Any> {
    std::rc::Rc::new(Ctx::default())
}
