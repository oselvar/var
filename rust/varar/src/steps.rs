//! The ergonomic author API: a `Steps` builder over `varar-core`'s registry, so
//! step definitions read as `s.stimulus(expr, …)` / `s.sensor(expr, …)` — the
//! call name IS the kind, matching every other port (and what the LSP/
//! tree-sitter dialect extracts). Mirrors the JVM `StateBinder`.
//!
//! The builder owns a `Registry` and folds each definition in with `varar-core`'s
//! pure `add_step` / `define_parameter_type*`; nothing global is mutated.

use varar_core::handler::{Handler, HandlerReturn};
use varar_core::registry::{
    FormatFn, ParseFn, Registry, add_step, create_registry, define_parameter_type,
    define_parameter_type_with_format,
};
use varar_core::step_kind::StepKind;
use varar_core::value::Value;

/// Converts an author's bare closure into a [`Handler`], inferring the arity —
/// and thus each `Value` parameter — from the closure itself. This is what lets
/// step files read `s.sensor("…", |state, a| …)` with no `Handler::sync1`
/// wrapper: `sensor`/`stimulus` take `impl IntoHandler<A>`, and the compiler
/// selects the impl whose `Fn` arity matches the closure.
///
/// `Args` is an inference-only marker — the tuple of the closure's *capture*
/// parameters (everything after the leading `state`) — following the axum/bevy
/// handler pattern; it never appears in author code. Impls cover 0–2 captures,
/// matching the fixed-arity `Handler::sync{0,1,2}` conveniences. For a dynamic
/// arity (3+ slots) or an async handler, build the [`Handler`] explicitly
/// (`Handler::sync_var`, `Handler::async0`, …) and pass it — the passthrough
/// impl accepts an already-built `Handler` unchanged (also how `Handler::noop`
/// is passed).
pub trait IntoHandler<Args> {
    fn into_handler(self) -> Handler;
}

impl<F: Fn(Value) -> HandlerReturn + 'static> IntoHandler<()> for F {
    fn into_handler(self) -> Handler {
        Handler::sync0(self)
    }
}
impl<F: Fn(Value, Value) -> HandlerReturn + 'static> IntoHandler<(Value,)> for F {
    fn into_handler(self) -> Handler {
        Handler::sync1(self)
    }
}
impl<F: Fn(Value, Value, Value) -> HandlerReturn + 'static> IntoHandler<(Value, Value)> for F {
    fn into_handler(self) -> Handler {
        Handler::sync2(self)
    }
}
impl IntoHandler<Handler> for Handler {
    fn into_handler(self) -> Handler {
        self
    }
}

pub struct Steps {
    registry: Registry,
}

impl Steps {
    /// A builder over a fresh registry.
    pub fn new() -> Steps {
        Steps {
            registry: create_registry(),
        }
    }

    /// A builder that continues folding into an existing registry.
    pub fn from_registry(registry: Registry) -> Steps {
        Steps { registry }
    }

    /// Register a stimulus (drives the software; returns the whole next state).
    ///
    /// The step's source file and line are captured automatically from the
    /// call site via `#[track_caller]` — the Rust analogue of how the TS/Python
    /// ports read them from the imported module. Authors never pass them; the
    /// captured file's stem (e.g. `numerals.steps`) is what the registry and
    /// conformance artifacts record.
    #[track_caller]
    pub fn stimulus<A>(&mut self, expression: &str, handler: impl IntoHandler<A>) -> &mut Steps {
        let loc = std::panic::Location::caller();
        self.registry = add_step(
            &self.registry,
            expression,
            loc.file(),
            loc.line() as usize,
            handler.into_handler(),
            Some(StepKind::Stimulus),
        )
        .expect("valid stimulus expression");
        self
    }

    /// Register a sensor (the read-only assertion; its return is compared).
    ///
    /// Source file and line are captured from the call site, same as
    /// [`Steps::stimulus`].
    #[track_caller]
    pub fn sensor<A>(&mut self, expression: &str, handler: impl IntoHandler<A>) -> &mut Steps {
        let loc = std::panic::Location::caller();
        self.registry = add_step(
            &self.registry,
            expression,
            loc.file(),
            loc.line() as usize,
            handler.into_handler(),
            Some(StepKind::Sensor),
        )
        .expect("valid sensor expression");
        self
    }

    /// Declare a custom parameter type.
    pub fn param(&mut self, name: &str, regexp: &str, parse: ParseFn) -> &mut Steps {
        self.registry = define_parameter_type(&self.registry, name, regexp, parse);
        self
    }

    /// Declare a custom parameter type that also renders values for diffs.
    pub fn param_with_format(
        &mut self,
        name: &str,
        regexp: &str,
        parse: ParseFn,
        format: FormatFn,
    ) -> &mut Steps {
        self.registry =
            define_parameter_type_with_format(&self.registry, name, regexp, parse, format);
        self
    }

    /// Consume the builder, yielding the accumulated registry.
    pub fn into_registry(self) -> Registry {
        self.registry
    }
}

impl Default for Steps {
    fn default() -> Steps {
        Steps::new()
    }
}
