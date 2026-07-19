// Package example is a standalone Vár sample: it runs the Markdown specs at the
// project root as `go test` tests via the vargotest adapter. The domain files
// (yahtzee.go, roman.go, library_domain.go) are the code under test; the
// steps_*.go files hold the step definitions, one per spec.
package example

import (
	"strings"

	vc "github.com/varar-dev/varar-go/core"
	"github.com/varar-dev/varar-go/varar"
)

// BuildRegistry threads one Steps builder through every spec's register func —
// the injected-builder model (Go has no import-for-side-effect story), with
// full-replacement Value state.
func BuildRegistry() vc.Registry {
	s := varar.NewSteps()
	registerHelloVar(s)
	registerDeepThought(s)
	registerTablesAndDocstrings(s)
	registerYahtzee(s)
	registerRomanNumerals(s)
	registerLibrary(s)
	return s.Registry()
}

// Context is the fresh initial state per step file — varcore keys state by a
// step's source file (captured at each Stimulus/Sensor call site). Matched by
// filename suffix so it is independent of the absolute path. Files whose steps
// are pure return Null.
func Context(file string) vc.Value {
	switch {
	case strings.HasSuffix(file, "hello.steps.go"):
		return varar.MapValue(map[string]varar.Value{"greeting": varar.StrValue(""), "result": varar.IntValue(0)})
	case strings.HasSuffix(file, "library.steps.go"):
		return varar.MapValue(map[string]varar.Value{
			"loans":   varar.ListValue(),
			"fee":     varar.IntValue(0),
			"granted": varar.BoolValue(false),
		})
	default:
		return varar.NullValue
	}
}

// --- shared Value helpers ---------------------------------------------------

func smap(v varar.Value) map[string]varar.Value {
	out := map[string]varar.Value{}
	if m, ok := v.AsMap(); ok {
		for k, vv := range m {
			out[k] = vv
		}
	}
	return out
}

func asInt(v varar.Value) int64 {
	i, ok := v.AsInt()
	if !ok {
		panic("expected an integer")
	}
	return i
}

func asStr(v varar.Value) string {
	s, ok := v.AsString()
	if !ok {
		panic("expected a string")
	}
	return s
}
