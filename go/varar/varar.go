// Package varar is the author facade over the core pipeline.
//
// Go uses the injected-builder author model (like Rust/Java/C#): a step file
// exposes a Register(*Steps) that adds its steps explicitly against a builder,
// rather than a module-scope accumulator. State evolution is full-replacement: a
// stimulus returns the whole next state. Source file/line are captured from the
// call site via runtime.Caller — the Go analogue of TS/Python reading them from
// the imported module — so authors never pass them.
package varar

import (
	"fmt"
	"runtime"

	"github.com/varar-dev/varar/go/core"
)

// Re-exported core types and constructors, so authors import only this package.
type (
	Value       = core.Value
	HandlerFunc = core.HandlerFunc
	Registry    = core.Registry
	ParseFn     = core.ParseFn
	FormatFn    = core.FormatFn
	StepKind    = core.StepKind
)

// NullValue is the null value.
var NullValue = core.NullValue

// Value constructors.
var (
	BoolValue  = core.BoolValue
	IntValue   = core.IntValue
	FloatValue = core.FloatValue
	StrValue   = core.StrValue
	ListValue  = core.ListValue
	ListOf     = core.ListOf
	MapValue   = core.MapValue
)

// Ptr returns a pointer to v — how a handler returns its value, in the
// (*Value, error) shape: `return varar.Ptr(varar.IntValue(42)), nil`.
var Ptr = core.Ptr

// Step kinds.
const (
	StimulusKind = core.Stimulus
	SensorKind   = core.Sensor
)

// Steps is the ergonomic author API: a builder over core's registry, so step
// definitions read as s.Stimulus(expr, …) / s.Sensor(expr, …) — the call name
// IS the kind, matching every other port (and what the LSP/tree-sitter dialect
// extracts).
// Steps is the author API, parameterised by C — the type of the state threaded
// through this file's steps. Pick your own struct and handlers speak it
// directly, never varar.Value:
//
//	type Ctx struct{ Loans []Loan; Fee int }
//
//	func Register(s *varar.Steps[Ctx]) {
//	    s.Stimulus("borrowed {title}, due back on {date}",
//	        func(ctx Ctx, title string, due Date) (Ctx, error) { … })
//	}
//
// Use varar.Value as C for dynamic, schemaless state.
type Steps[C any] struct {
	registry core.Registry
}

// NewSteps is a builder over a fresh registry.
func NewSteps[C any]() *Steps[C] {
	return &Steps[C]{registry: core.CreateRegistry()}
}

// FromRegistry is a builder that continues folding into an existing registry.
func FromRegistry[C any](registry core.Registry) *Steps[C] {
	return &Steps[C]{registry: registry}
}

// addAt registers a step with an explicitly supplied source location, so the
// exported wrappers can pass their own caller rather than reporting this file.
func (s *Steps[C]) addAt(expression string, handler HandlerFunc, kind core.StepKind, file string, line int) *Steps[C] {
	k := kind
	next, err := core.AddStep(s.registry, expression, file, line, core.NewHandler(handler), &k)
	if err != nil {
		panic(err)
	}
	s.registry = next
	return s
}

// Stimulus registers a stimulus: it drives the software and returns the whole
// next state.
//
// The handler's parameters may be plain Go values — the first is always the
// state, the rest are the step's slots — returning (Value, error):
//
//	s.Stimulus("I greet {string}",
//	    func(ctx Ctx, name string) (Ctx, error) { … })
//
// The raw form func(C, []Value) (any, error) is also accepted. The
// signature is validated at registration; the source file and line are captured
// from the call site.
func (s *Steps[C]) Stimulus(expression string, handler any) *Steps[C] {
	_, file, line, _ := runtime.Caller(1)
	return s.addAt(expression, adapt[C](handler, core.Stimulus, expression), core.Stimulus, file, line)
}

// Sensor registers a sensor: the read-only assertion, whose return is compared
// against the document.
//
// The handler's parameters may be plain Go values — the first is always the
// state, the rest are the step's slots — returning one value per slot (each the
// same type as that slot) plus an error:
//
//	s.Sensor("The square of {int} is {int}.",
//	    func(ctx Ctx, n, square int) (int, int, error) { return n, n * n, nil })
//
// The raw form func(C, []Value) (any, error) is also accepted. The
// signature is validated at registration; the source file and line are captured
// from the call site.
func (s *Steps[C]) Sensor(expression string, handler any) *Steps[C] {
	_, file, line, _ := runtime.Caller(1)
	return s.addAt(expression, adapt[C](handler, core.Sensor, expression), core.Sensor, file, line)
}

// Param declares a custom parameter type, in terms of your own Go type.
//
//	s.Param("date", `[A-Z][a-z]+ \d{1,2}, \d{4}`,
//	    func(g []string) Date { return ParseDate(g[0]) },
//	    func(d Date) (string, bool) { return FormatDate(d), true })
//
// parse must be a func([]string) T — it receives the type's regexp capture
// groups (or the whole match when it has none) and returns your T, which then
// arrives directly as the step's slot. format is optional — omit it, or pass a
// func(T) (string, bool) rendering a T back in the document's notation, used
// when a mismatch is reported. Both are validated at registration.
//
// format is variadic so it can be omitted, matching every other port (Java has
// 2/3/4-arg overloads, .NET and Kotlin use defaults). Passing an explicit nil
// still works.
func (s *Steps[C]) Param(name, regexp string, parse any, format ...any) *Steps[C] {
	if len(format) > 1 {
		panic(fmt.Sprintf("Param(%q): expected at most one format function, got %d", name, len(format)))
	}
	coreParse, valueOf := adaptParse(name, parse)
	var f any
	if len(format) == 1 {
		f = format[0]
	}
	if f == nil {
		s.registry = core.DefineParameterType(s.registry, name, regexp, coreParse)
		return s
	}
	s.registry = core.DefineParameterTypeWithFormat(
		s.registry, name, regexp, coreParse, adaptFormat(name, f, valueOf))
	return s
}

// Registry yields the accumulated registry.
func (s *Steps[C]) Registry() core.Registry {
	return s.registry
}
