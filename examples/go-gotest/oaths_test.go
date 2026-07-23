package example_test

import (
	"testing"

	example "github.com/varar-dev/varar-examples/go-gotest"
	"github.com/varar-dev/varar/go/gotest"
)

// TestSpecs runs every Markdown spec matched by varar.config.json as a Go
// subtest — one per example — through the gotest adapter.
//
//	go test                                  # one subtest per example, all green
//	go test -v                               # lists every example
//	go test -run 'TestSpecs/yahtzee'         # run a single spec
//	VARAR_UPDATE=1 go test                     # accept drift
func TestSpecs(t *testing.T) {
	gotest.Run(t, ".", example.BuildRegistry, example.Context)
}
