package varcore

// The dynamic value model — Go's replacement for the TS/JS raw values and the
// Rust `Value` enum. One tagged struct carries handler arguments, handler
// returns, thread-through state, row objects, table rows, and the conformance
// wire values.
//
// Equality (ValueEqual) mirrors Rust's derived PartialEq / Java's
// Objects.equals: Int(2) != Float(2.0), and Map equality is order-insensitive.

// ValueKind is the discriminant of a Value.
type ValueKind int

const (
	KindNull ValueKind = iota
	KindBool
	KindInt
	KindFloat
	KindString
	KindList
	KindMap
)

// Value is a dynamic JSON-ish value.
type Value struct {
	Kind  ValueKind
	Bool  bool
	Int   int64
	Float float64
	Str   string
	List  []Value
	Map   map[string]Value
}

// NullValue is the null value.
var NullValue = Value{Kind: KindNull}

// BoolValue builds a boolean Value.
func BoolValue(b bool) Value { return Value{Kind: KindBool, Bool: b} }

// IntValue builds an integer Value ({int} transforms here).
func IntValue(i int64) Value { return Value{Kind: KindInt, Int: i} }

// FloatValue builds a floating-point Value; serialized as an integer when integral.
func FloatValue(f float64) Value { return Value{Kind: KindFloat, Float: f} }

// StrValue builds a string Value.
func StrValue(s string) Value { return Value{Kind: KindString, Str: s} }

// ListValue builds a list Value.
func ListValue(items ...Value) Value {
	if items == nil {
		items = []Value{}
	}
	return Value{Kind: KindList, List: items}
}

// ListOf builds a list Value from a slice.
func ListOf(items []Value) Value {
	if items == nil {
		items = []Value{}
	}
	return Value{Kind: KindList, List: items}
}

// MapValue builds a map Value.
func MapValue(m map[string]Value) Value {
	if m == nil {
		m = map[string]Value{}
	}
	return Value{Kind: KindMap, Map: m}
}

// TypeName is a short type name for ReturnShapeError messages, mirroring
// the reference's getClass().getSimpleName().
func (v Value) TypeName() string {
	switch v.Kind {
	case KindNull:
		return "null"
	case KindBool:
		return "Boolean"
	case KindInt:
		return "Integer"
	case KindFloat:
		return "Double"
	case KindString:
		return "String"
	case KindList:
		return "List"
	case KindMap:
		return "Map"
	}
	return "null"
}

// IsNull reports whether v is null (or the zero Value).
func (v Value) IsNull() bool { return v.Kind == KindNull }

// ValueEqual reports structural equality (Rust PartialEq / Objects.equals):
// distinct kinds are never equal (so Int(2) != Float(2.0)), lists compare
// order-sensitively, maps order-insensitively.
func ValueEqual(a, b Value) bool {
	if a.Kind != b.Kind {
		return false
	}
	switch a.Kind {
	case KindNull:
		return true
	case KindBool:
		return a.Bool == b.Bool
	case KindInt:
		return a.Int == b.Int
	case KindFloat:
		return a.Float == b.Float
	case KindString:
		return a.Str == b.Str
	case KindList:
		if len(a.List) != len(b.List) {
			return false
		}
		for i := range a.List {
			if !ValueEqual(a.List[i], b.List[i]) {
				return false
			}
		}
		return true
	case KindMap:
		if len(a.Map) != len(b.Map) {
			return false
		}
		for k, av := range a.Map {
			bv, ok := b.Map[k]
			if !ok || !ValueEqual(av, bv) {
				return false
			}
		}
		return true
	}
	return false
}
