// Package example is a standalone Vár sample: it runs the Markdown specs at the
// project root as `go test` tests via the gotest adapter. The domain files
// (yahtzee.go, roman.go, library_domain.go) are the code under test; the
// *.steps.go files hold the step definitions, one per spec.
package example

import (
	"github.com/varar-dev/varar-go/core"
	"github.com/varar-dev/varar-go/varar"
)

// BuildRegistry threads one Steps builder through every spec's register func —
// the injected-builder model (Go has no import-for-side-effect story), with
// full-replacement Value state.
func BuildRegistry() core.Registry {
	s := varar.NewSteps[Ctx]()
	registerHelloVar(s)
	registerDeepThought(s)
	registerTablesAndDocstrings(s)
	registerYahtzee(s)
	registerRomanNumerals(s)
	registerLibrary(s)
	return s.Registry()
}

// Context is the fresh initial state per step file. Every spec starts from a
// zero Ctx; varcore keys state per step file, so specs never see each other's.
func Context(file string) any {
	return Ctx{}
}
