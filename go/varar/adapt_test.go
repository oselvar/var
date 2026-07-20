package varar

import (
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/varar-dev/varar/go/core"
)

// The adapter's happy paths are proven by the conformance corpus (bundles
// 02/04/06/14 are authored with plain Go parameters and reproduce their goldens
// byte-for-byte). What is tested here is the validation: malformed handler
// signatures must be rejected at registration, and slot mismatches that only
// the document knows must fail the step with a message naming the slot.

func mustPanic(t *testing.T, want string, fn func()) {
	t.Helper()
	defer func() {
		r := recover()
		if r == nil {
			t.Fatalf("expected a panic mentioning %q", want)
		}
		if msg, _ := r.(string); !strings.Contains(msg, want) {
			t.Errorf("panic %q should mention %q", msg, want)
		}
	}()
	fn()
}

func TestRegistrationRejectsMalformedHandlers(t *testing.T) {
	cases := []struct {
		name    string
		want    string
		handler any
	}{
		{"not a func", "must be a func", 42},
		{"no state parameter", "first parameter must be the state", func() error { return nil }},
		{"state is not a Value", "first parameter must be the state", func(n int) error { return nil }},
		{"unsupported slot type", "cannot be read from a slot", func(state Value, b []byte) ([]byte, error) { return b, nil }},
		{"last result not error", "last result must be error", func(state Value, n int) int { return n }},
		{"sensor result count", "must return 1 value(s) plus error", func(state Value, n int) error { return nil }},
		{"sensor result type", "sensor returns each slot's own type", func(state Value, n int) (string, error) { return "", nil }},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			mustPanic(t, c.want, func() { adapt[Value](c.handler, core.Sensor, "expr") })
		})
	}
	mustPanic(t, "must return (core.Value, error)", func() {
		adapt[Value](func(state Value, n int) (int, error) { return n, nil }, core.Stimulus, "expr")
	})
}

func TestRawHandlerPassesThroughUntouched(t *testing.T) {
	raw := func(state Value, args []Value) (any, error) { return core.Ptr(core.IntValue(1)), nil }
	h := adapt[Value](raw, core.Sensor, "expr")
	got, err := h(core.NullValue, nil)
	if err != nil || !core.ValueEqual(*(got.(*Value)), core.IntValue(1)) {
		t.Errorf("got %v, %v", got, err)
	}
}

func TestToGoConvertsSupportedTypes(t *testing.T) {
	cases := []struct {
		v    Value
		t    reflect.Type
		want any
	}{
		{core.IntValue(7), reflect.TypeOf(int(0)), 7},
		{core.IntValue(7), reflect.TypeOf(int64(0)), int64(7)},
		{core.StrValue("hi"), reflect.TypeOf(""), "hi"},
		{core.FloatValue(2.5), reflect.TypeOf(float64(0)), 2.5},
		{core.BoolValue(true), reflect.TypeOf(false), true},
	}
	for _, c := range cases {
		got, err := toGo(c.v, c.t, 0)
		if err != nil || got.Interface() != c.want {
			t.Errorf("%v: got %v, %v", c.v, got, err)
		}
	}
	// Value is the escape hatch: it passes through whatever the slot holds.
	m := core.MapValue(map[string]core.Value{"a": core.IntValue(1)})
	got, err := toGo(m, valueType, 0)
	if err != nil || !core.ValueEqual(got.Interface().(Value), m) {
		t.Errorf("Value passthrough: got %v, %v", got, err)
	}
}

// A slot whose runtime kind does not match the declared type fails the step.
func TestMismatchedSlotTypeFailsTheStep(t *testing.T) {
	s := NewSteps[Value]()
	s.Sensor("the result is {word}", func(state Value, n int) (int, error) { return n, nil })
	plan := core.Plan(core.Parse("t.md", "the result is IV."), s.Registry())
	failure := core.ExecutePlan(plan, core.ExecutePorts{})
	if failure == nil {
		t.Fatal("expected the step to fail reading a String slot as int")
	}
	if msg := failure.Error.Message(); !strings.Contains(msg, "cannot be read as int") {
		t.Errorf("message %q should explain the slot type mismatch", msg)
	}
}

// The slot count is only known from the document, so an arity mismatch fails
// the step rather than registration.
func TestSlotCountMismatchFailsTheStep(t *testing.T) {
	s := NewSteps[Value]()
	s.Sensor("I have {int} cukes", func(state Value, a, b int) (int, int, error) { return a, b, nil })
	plan := core.Plan(core.Parse("t.md", "I have 5 cukes."), s.Registry())
	failure := core.ExecutePlan(plan, core.ExecutePorts{})
	if failure == nil {
		t.Fatal("expected the step to fail on the slot-count mismatch")
	}
	if msg := failure.Error.Message(); !strings.Contains(msg, "handler takes 2") {
		t.Errorf("message %q should name the handler arity", msg)
	}
}

// --- domain types as slots (the ValueDecoder/ValueEncoder pair) --------------

// celsius exercises a named primitive: no decoder needed, the kind is enough.
type celsius int64

// stamp exercises a struct domain type, the LocalDate-style case.
type stamp struct{ Year, Day int64 }

func (s *stamp) DecodeVarValue(v Value) error {
	m, ok := v.AsMap()
	if !ok {
		return errNotAStamp
	}
	*s = stamp{Year: m["year"].MustInt(), Day: m["day"].MustInt()}
	return nil
}

func (s stamp) EncodeVarValue() Value {
	return core.MapValue(map[string]Value{
		"year": core.IntValue(s.Year), "day": core.IntValue(s.Day),
	})
}

var errNotAStamp = errStr("not a stamp")

type errStr string

func (e errStr) Error() string { return string(e) }

func TestDomainTypeSlotRoundTrips(t *testing.T) {
	encoded := stamp{Year: 2026, Day: 12}.EncodeVarValue()
	got, err := toGo(encoded, reflect.TypeOf(stamp{}), 0)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Interface().(stamp) != (stamp{Year: 2026, Day: 12}) {
		t.Errorf("decoded %v", got.Interface())
	}
	if back := fromGo(got); !core.ValueEqual(back, encoded) {
		t.Errorf("re-encoded %v, want %v", back, encoded)
	}
}

func TestNamedPrimitiveSlotConverts(t *testing.T) {
	got, err := toGo(core.IntValue(21), reflect.TypeOf(celsius(0)), 0)
	if err != nil || got.Interface().(celsius) != 21 {
		t.Fatalf("got %v, %v", got, err)
	}
	if back := fromGo(got); !core.ValueEqual(back, core.IntValue(21)) {
		t.Errorf("re-encoded %v", back)
	}
}

func TestDomainTypeIsAcceptedAtRegistration(t *testing.T) {
	s := NewSteps[Value]()
	s.Param("date", `[A-Z][a-z]+ \d{1,2}, \d{4}`, func(g []string) Value {
		return stamp{Year: 2026, Day: 12}.EncodeVarValue()
	}, nil)
	// A decoder-only type is fine as a stimulus slot...
	s.Stimulus("due on {date}", func(state Value, d stamp) (Value, error) { return state, nil })
	// ...and, because stamp also encodes, as a sensor slot.
	s.Sensor("the date is {date}", func(state Value, d stamp) (stamp, error) { return d, nil })
	if n := len(s.Registry().Steps); n != 2 {
		t.Errorf("registered %d steps", n)
	}
}

// A type with no mapping to a value at all — a channel — is rejected at
// registration. Plain structs are fine: they map field-by-field.
func TestUnmappableTypeRejectedAtRegistration(t *testing.T) {
	mustPanic(t, "cannot be read from a slot", func() {
		adapt[Value](func(state Value, c chan int) (chan int, error) { return c, nil }, core.Sensor, "expr")
	})
}

// A plain struct needs no interface: its exported fields map to a Value map.
func TestPlainStructSlotRoundTrips(t *testing.T) {
	type point struct{ X, Y int }
	encoded := fromGo(reflect.ValueOf(point{X: 3, Y: 4}))
	got, err := toGo(encoded, reflect.TypeOf(point{}), 0)
	if err != nil || got.Interface().(point) != (point{X: 3, Y: 4}) {
		t.Fatalf("got %v, %v", got, err)
	}
}

// time.Time is the motivating case for TextMarshaler support: it is a struct
// whose fields are ALL unexported, so the field-by-field path could never
// populate it. Before this was handled it decoded to the zero time and reported
// no error at all — a silently wrong date rather than a failure. It must work as
// a slot type directly, with no wrapper in the author's code.
func TestTimeTimeSlotRoundTripsWithoutAWrapper(t *testing.T) {
	when := time.Date(2026, time.June, 1, 0, 0, 0, 0, time.UTC)

	encoded := fromGo(reflect.ValueOf(when))
	if _, ok := encoded.AsString(); !ok {
		t.Fatalf("expected a string Value, got %s", encoded.TypeName())
	}

	got, err := toGo(encoded, reflect.TypeOf(time.Time{}), 0)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if back := got.Interface().(time.Time); !back.Equal(when) {
		t.Errorf("round-tripped to %v, want %v", back, when)
	}
}

// The regression guard for the silent-zero bug: a struct the adapter cannot
// populate — no exported fields, no decoder, no TextUnmarshaler — must be
// rejected when the step is registered, not quietly decoded to its zero value
// when the step runs.
func TestFieldlessStructRejectedAtRegistration(t *testing.T) {
	type opaque struct{ hidden int }
	mustPanic(t, "cannot be read from a slot", func() {
		adapt[Value](func(state Value, o opaque) (Value, error) { return state, nil }, core.Stimulus, "expr")
	})
}
