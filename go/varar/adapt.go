package varar

import (
	"fmt"
	"reflect"

	"github.com/varar-dev/varar-go/core"
)

// Handler adaptation — how `s.Sensor(expr, handler)` accepts a handler whose
// parameters are plain Go values.
//
// The slot contract is the same in every port: a step's slots are its
// expression captures in order, then the trailing table/doc string if any. A
// sensor returns one value per slot (TypeScript spells the two-slot case as the
// tuple `[n, n * n]`; Go spells it as two return values), and a stimulus returns
// the whole next state.
//
//	s.Sensor("The square of {int} is {int}.",
//	    func(state varar.Value, n, square int) (int, int, error) { return n, n * n, nil })
//
//	s.Stimulus("I greet {string}",
//	    func(state varar.Value, name string) (varar.Value, error) { … })
//
// Go has no variadic generics, so this is done with reflection rather than a
// family of numbered constructors. The signature is validated **eagerly, at
// registration**, so a malformed handler panics when the suite wires up rather
// than when that step happens to run.
//
// The raw form is still accepted under the same name and passed through
// untouched — the escape hatch for slots with no plain Go spelling (a whole
// table, a custom parameter type that parses to a map) and for header-bound
// rows, which compare by column rather than positionally by slot:
//
//	s.Sensor("…", func(state varar.Value, args []varar.Value) (*varar.Value, error) { … })

// ValueDecoder lets a domain type appear directly as a step parameter, the way
// Java's Object-based core passes a LocalDate straight to the handler. A custom
// parameter type's parse produces a Value; implementing this says how to read
// that Value back into your own type — the json.Unmarshaler of this API.
//
//	func (d *Date) DecodeVarValue(v varar.Value) error { … }
//
//	s.Stimulus("borrowed {title}, due back on {date}",
//	    func(state varar.Value, title string, due Date) (varar.Value, error) { … })
type ValueDecoder interface {
	DecodeVarValue(v Value) error
}

// ValueEncoder is the inverse, needed when a domain type is a SENSOR slot: the
// core compares the returned value against the captured one, so it must be able
// to go back to a Value. Use a value receiver.
type ValueEncoder interface {
	EncodeVarValue() Value
}

var (
	decoderType  = reflect.TypeOf((*ValueDecoder)(nil)).Elem()
	encoderType  = reflect.TypeOf((*ValueEncoder)(nil)).Elem()
	valueType    = reflect.TypeOf(Value{})
	valueSlice   = reflect.TypeOf([]Value{})
	valuePointer = reflect.TypeOf(&Value{})
	errorType    = reflect.TypeOf((*error)(nil)).Elem()
)

// decodesFromValue reports whether t can be built from a Value — either it is a
// Value, a Go primitive kind, or it implements ValueDecoder.
func decodesFromValue(t reflect.Type) bool {
	if t == valueType || reflect.PointerTo(t).Implements(decoderType) {
		return true
	}
	return primitiveKind(t)
}

// encodesToValue reports whether t can go back to a Value, which a sensor's
// results must do so the core can compare them.
func encodesToValue(t reflect.Type) bool {
	if t == valueType || t.Implements(encoderType) {
		return true
	}
	return primitiveKind(t)
}

func primitiveKind(t reflect.Type) bool {
	switch t.Kind() {
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Float32, reflect.Float64, reflect.String, reflect.Bool:
		return true
	}
	return false
}

// isRawHandler reports whether fn is the pass-through form
// func(Value, []Value) (*Value, error).
func isRawHandler(t, ctxType reflect.Type) bool {
	return t.NumIn() == 2 && t.In(0) == ctxType && t.In(1) == valueSlice &&
		t.NumOut() == 2 && t.Out(0) == valuePointer && t.Out(1) == errorType
}

// stateAs reads the opaque state the core threads back as C, yielding C's zero
// value on the first step of a file (when no factory supplied one).
func stateAs[C any](state any) C {
	if c, ok := state.(C); ok {
		return c
	}
	var zero C
	return zero
}

// adapt validates handler against kind and returns it as a core HandlerFunc.
// It panics on a malformed signature — an author wiring error, like a duplicate
// step expression, surfaced at registration.
func adapt[C any](handler any, kind core.StepKind, expression string) HandlerFunc {
	if handler == nil {
		panic(fmt.Sprintf("var: %q: handler must not be nil", expression))
	}
	if h, ok := handler.(HandlerFunc); ok {
		return h
	}
	if h, ok := handler.(func(C, []Value) (any, error)); ok {
		return func(state any, args []Value) (any, error) { return h(stateAs[C](state), args) }
	}

	fn := reflect.ValueOf(handler)
	t := fn.Type()
	if t.Kind() != reflect.Func {
		panic(fmt.Sprintf("var: %q: handler must be a func, got %s", expression, t))
	}
	if isRawHandler(t, reflect.TypeOf((*C)(nil)).Elem()) {
		// The raw form's result is a *Value, which is the comparison value for a
		// sensor but the NEXT STATE for a stimulus — so it only expresses a
		// stimulus when the state type is Value itself.
		if kind == core.Stimulus && reflect.TypeOf((*C)(nil)).Elem() != valueType {
			panic(fmt.Sprintf(
				"var: %q: the raw []Value form returns *varar.Value, which cannot be the next state of type %s — take and return %s instead",
				expression, reflect.TypeOf((*C)(nil)).Elem(), reflect.TypeOf((*C)(nil)).Elem()))
		}
		return func(state any, args []Value) (any, error) {
			out := fn.Call([]reflect.Value{reflect.ValueOf(stateAs[C](state)), reflect.ValueOf(args)})
			p, err := outValuePointer(out[0]), outError(out[1])
			if err != nil {
				return nil, err
			}
			if kind == core.Stimulus {
				if p == nil {
					return NullValue, nil
				}
				return *p, nil
			}
			return p, nil
		}
	}
	ctxType := reflect.TypeOf((*C)(nil)).Elem()
	if t.NumIn() < 1 || t.In(0) != ctxType {
		panic(fmt.Sprintf("var: %q: handler's first parameter must be the state (%s), got %s",
			expression, ctxType, t))
	}

	slots := t.NumIn() - 1
	for i := 1; i < t.NumIn(); i++ {
		if !decodesFromValue(t.In(i)) {
			panic(fmt.Sprintf(
				"var: %q: parameter %d is %s, which cannot be read from a slot — use a Go primitive, varar.Value, or implement varar.ValueDecoder",
				expression, i, t.In(i)))
		}
	}
	if t.NumOut() == 0 || t.Out(t.NumOut()-1) != errorType {
		panic(fmt.Sprintf("var: %q: handler's last result must be error, got %s", expression, t))
	}

	if kind == core.Stimulus {
		// A stimulus returns the whole next state, whatever its arity.
		if t.NumOut() != 2 || t.Out(0) != ctxType {
			panic(fmt.Sprintf(
				"var: %q: a stimulus must return (%s, error) — the whole next state — got %s",
				expression, ctxType, t))
		}
		return func(state any, args []Value) (any, error) {
			in, err := coerceArgs[C](fn, t, slots, state, args, expression)
			if err != nil {
				return nil, err
			}
			out := fn.Call(in)
			if err := outError(out[1]); err != nil {
				return nil, err
			}
			return out[0].Interface(), nil
		}
	}

	// A sensor returns one value per slot, each the same type as that slot's
	// parameter — the core compares the two, so a different type could never be
	// equal.
	if t.NumOut() != slots+1 {
		panic(fmt.Sprintf(
			"var: %q: a sensor takes %d slot(s), so it must return %d value(s) plus error, got %s",
			expression, slots, slots, t))
	}
	for i := 0; i < slots; i++ {
		if !encodesToValue(t.Out(i)) {
			panic(fmt.Sprintf(
				"var: %q: result %d is %s, which cannot be compared — use a Go primitive, varar.Value, or implement varar.ValueEncoder (value receiver)",
				expression, i+1, t.Out(i)))
		}
		if t.Out(i) != t.In(i+1) {
			panic(fmt.Sprintf(
				"var: %q: sensor result %d is %s but slot %d is %s — a sensor returns each slot's own type",
				expression, i+1, t.Out(i), i+1, t.In(i+1)))
		}
	}
	return func(state any, args []Value) (any, error) {
		in, err := coerceArgs[C](fn, t, slots, state, args, expression)
		if err != nil {
			return nil, err
		}
		out := fn.Call(in)
		if err := outError(out[slots]); err != nil {
			return nil, err
		}
		if slots == 0 {
			return nil, nil // nothing to compare
		}
		vs := make([]Value, slots)
		for i := 0; i < slots; i++ {
			vs[i] = fromGo(out[i])
		}
		if slots == 1 {
			return core.Ptr(vs[0]), nil // the return IS the single slot's value
		}
		return core.Ptr(ListOf(vs)), nil
	}
}

// coerceArgs builds the reflect call arguments, checking the slot count the
// expression actually produced against the handler's arity.
func coerceArgs[C any](fn reflect.Value, t reflect.Type, slots int, state any, args []Value, expression string) ([]reflect.Value, error) {
	if len(args) != slots {
		return nil, fmt.Errorf("var: %q has %d slot(s), but the handler takes %d",
			expression, len(args), slots)
	}
	in := make([]reflect.Value, slots+1)
	in[0] = reflect.ValueOf(stateAs[C](state))
	for i, arg := range args {
		v, err := toGo(arg, t.In(i+1), i)
		if err != nil {
			return nil, err
		}
		in[i+1] = v
	}
	return in, nil
}

// toGo converts a captured Value to the handler's declared parameter type.
func toGo(v Value, t reflect.Type, slot int) (reflect.Value, error) {
	fail := func(want string) (reflect.Value, error) {
		return reflect.Value{}, fmt.Errorf("var: slot %d is a %s, cannot be read as %s",
			slot+1, v.TypeName(), want)
	}
	if t == valueType {
		return reflect.ValueOf(v), nil
	}
	// A domain type says how to read itself (the json.Unmarshaler analogue).
	if reflect.PointerTo(t).Implements(decoderType) {
		ptr := reflect.New(t)
		if err := ptr.Interface().(ValueDecoder).DecodeVarValue(v); err != nil {
			return reflect.Value{}, fmt.Errorf("var: slot %d: %w", slot+1, err)
		}
		return ptr.Elem(), nil
	}
	// Primitive kinds, so a named type like `type Celsius int64` works too.
	switch t.Kind() {
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		n, ok := v.AsInt()
		if !ok {
			return fail(t.String())
		}
		return reflect.ValueOf(n).Convert(t), nil
	case reflect.Float32, reflect.Float64:
		f, ok := v.AsFloat()
		if !ok {
			return fail(t.String())
		}
		return reflect.ValueOf(f).Convert(t), nil
	case reflect.String:
		str, ok := v.AsString()
		if !ok {
			return fail(t.String())
		}
		return reflect.ValueOf(str).Convert(t), nil
	case reflect.Bool:
		b, ok := v.AsBool()
		if !ok {
			return fail(t.String())
		}
		return reflect.ValueOf(b).Convert(t), nil
	}
	return reflect.Value{}, fmt.Errorf("var: unsupported slot type %s", t)
}

// fromGo converts a handler's returned value back to a Value for comparison.
func fromGo(rv reflect.Value) Value {
	if enc, ok := rv.Interface().(ValueEncoder); ok {
		return enc.EncodeVarValue()
	}
	t := rv.Type()
	if t == valueType {
		return rv.Interface().(Value)
	}
	switch t.Kind() {
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		return IntValue(rv.Int())
	case reflect.Float32, reflect.Float64:
		return FloatValue(rv.Float())
	case reflect.String:
		return StrValue(rv.String())
	case reflect.Bool:
		return BoolValue(rv.Bool())
	}
	return NullValue
}

func outError(rv reflect.Value) error {
	if rv.IsNil() {
		return nil
	}
	return rv.Interface().(error)
}

func outValuePointer(rv reflect.Value) *Value {
	if rv.IsNil() {
		return nil
	}
	return rv.Interface().(*Value)
}
