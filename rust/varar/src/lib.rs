//! `varar` — the author facade over [`varar_core`].
//!
//! Rust uses the **injected-Registrar** author model (ADR 0006): a step file
//! exposes a `register(Registry) -> Registry` that adds its steps explicitly,
//! rather than the module-scope accumulator TypeScript/Python use. There is
//! therefore no `defineState`/`steps()` side-effecting global here — the
//! "author API" is `varar_core::registry` plus the handler/value types, curated
//! into a single import surface. This crate is also where the
//! registry/plan/trace conformance gates live (see `tests/conformance.rs`),
//! mirroring the Java `var` module: they need both `varar-core`'s pipeline and
//! the author surface every bundle fixture is written against.

mod steps;
pub use steps::{IntoHandler, Steps};

pub use varar_core::error::HandlerError;
pub use varar_core::handler::{Handler, HandlerReturn, StepReturn};
pub use varar_core::registry::{
    CustomParameterType, FormatFn, ParseFn, Registry, StepRegistration, add_step, create_registry,
    define_parameter_type, define_parameter_type_with_format,
};
pub use varar_core::step_kind::StepKind;
pub use varar_core::value::Value;
