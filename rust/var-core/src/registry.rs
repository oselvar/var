//! Step registry — port of `registry.ts` / `Registry.java`. Wraps the owned
//! [`crate::expression`] layer. Persistent-value semantics: `add_step` /
//! `define_parameter_type` return a new [`Registry`]; the argument is unchanged.

use crate::error::RegistryError;
use crate::expression::{CompiledExpression, ParameterTypeRegistry};
use crate::handler::Handler;
use crate::step_kind::StepKind;
use crate::value::Value;
use std::collections::HashMap;
use std::rc::Rc;

pub use crate::expression::ParseFn;

/// A parameter-type display formatter (the inverse of `parse`): renders a value
/// back in the document's notation. `None` result → fall through to the generic
/// rendering chain.
pub type FormatFn = Rc<dyn Fn(&Value) -> Option<String>>;

/// A custom parameter type as registered by an author — name plus bare pattern
/// source (the string the registry artifact serializes).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CustomParameterType {
    pub name: String,
    pub regexp: String,
}

impl CustomParameterType {
    pub fn new(name: impl Into<String>, regexp: impl Into<String>) -> CustomParameterType {
        CustomParameterType {
            name: name.into(),
            regexp: regexp.into(),
        }
    }
}

/// One registered step: source expression, source location, handler, compiled
/// expression, and role (`kind` may be `None` — the legacy/kindless path).
#[derive(Clone)]
pub struct StepRegistration {
    pub expression: String,
    pub expression_source_file: String,
    pub expression_source_line: usize,
    pub handler: Handler,
    pub compiled: CompiledExpression,
    pub kind: Option<StepKind>,
}

/// The step registry.
#[derive(Clone)]
pub struct Registry {
    pub steps: Vec<Rc<StepRegistration>>,
    pub parameter_types: ParameterTypeRegistry,
    pub custom_parameter_types: Vec<CustomParameterType>,
    pub formats: HashMap<String, FormatFn>,
}

/// An empty registry with a fresh default parameter-type registry.
pub fn create_registry() -> Registry {
    Registry {
        steps: Vec::new(),
        parameter_types: ParameterTypeRegistry::new(),
        custom_parameter_types: Vec::new(),
        formats: HashMap::new(),
    }
}

/// Compiles `expression` against `registry`'s parameter types and appends it,
/// returning a new [`Registry`]. Errors on a duplicate expression or an
/// un-compilable one.
pub fn add_step(
    registry: &Registry,
    expression: &str,
    expression_source_file: &str,
    expression_source_line: usize,
    handler: Handler,
    kind: Option<StepKind>,
) -> Result<Registry, RegistryError> {
    for existing in &registry.steps {
        if existing.expression == expression {
            return Err(RegistryError::DuplicateStep(format!(
                "duplicate step definition for \"{}\" at {}:{} and {}:{}",
                expression,
                existing.expression_source_file,
                existing.expression_source_line,
                expression_source_file,
                expression_source_line
            )));
        }
    }
    let compiled = CompiledExpression::compile(expression, &registry.parameter_types)
        .map_err(|e| RegistryError::Expression(e.message))?;
    let mut steps = registry.steps.clone();
    steps.push(Rc::new(StepRegistration {
        expression: expression.to_string(),
        expression_source_file: expression_source_file.to_string(),
        expression_source_line,
        handler,
        compiled,
        kind,
    }));
    Ok(Registry {
        steps,
        parameter_types: registry.parameter_types.clone(),
        custom_parameter_types: registry.custom_parameter_types.clone(),
        formats: registry.formats.clone(),
    })
}

/// Registers a custom parameter type and returns a new [`Registry`] recording it.
pub fn define_parameter_type(
    registry: &Registry,
    name: &str,
    regexp: &str,
    parse: ParseFn,
) -> Registry {
    let mut parameter_types = registry.parameter_types.clone();
    parameter_types.define(name, regexp, parse);
    let mut custom_parameter_types = registry.custom_parameter_types.clone();
    custom_parameter_types.push(CustomParameterType::new(name, regexp));
    Registry {
        steps: registry.steps.clone(),
        parameter_types,
        custom_parameter_types,
        formats: registry.formats.clone(),
    }
}

/// As [`define_parameter_type`], additionally retaining a display `format`.
pub fn define_parameter_type_with_format(
    registry: &Registry,
    name: &str,
    regexp: &str,
    parse: ParseFn,
    format: FormatFn,
) -> Registry {
    let mut next = define_parameter_type(registry, name, regexp, parse);
    next.formats.insert(name.to_string(), format);
    next
}
