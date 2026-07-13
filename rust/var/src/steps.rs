//! The ergonomic author API: a `Steps` builder over `var-core`'s registry, so
//! step definitions read as `s.stimulus(expr, …)` / `s.sensor(expr, …)` — the
//! call name IS the kind, matching every other port (and what the LSP/
//! tree-sitter dialect extracts). Mirrors the JVM `StateBinder`.
//!
//! The builder owns a `Registry` and folds each definition in with `var-core`'s
//! pure `add_step` / `define_parameter_type*`; nothing global is mutated.

use var_core::handler::Handler;
use var_core::registry::{
    FormatFn, ParseFn, Registry, add_step, create_registry, define_parameter_type,
    define_parameter_type_with_format,
};
use var_core::step_kind::StepKind;

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
    pub fn stimulus(
        &mut self,
        expression: &str,
        file: &str,
        line: usize,
        handler: Handler,
    ) -> &mut Steps {
        self.registry = add_step(
            &self.registry,
            expression,
            file,
            line,
            handler,
            Some(StepKind::Stimulus),
        )
        .expect("valid stimulus expression");
        self
    }

    /// Register a sensor (the read-only assertion; its return is compared).
    pub fn sensor(
        &mut self,
        expression: &str,
        file: &str,
        line: usize,
        handler: Handler,
    ) -> &mut Steps {
        self.registry = add_step(
            &self.registry,
            expression,
            file,
            line,
            handler,
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
