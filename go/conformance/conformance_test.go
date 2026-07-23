// Registry / plan / trace conformance gates — the three stages deferred from
// core (which gates only var-doc). For every bundle in the shared corpus,
// load its Go step fixture, build the registry, and assert the
// registry/plan/trace artifacts byte-for-byte against the committed goldens.
//
// Fixtures live alongside every other language's *.steps.* in
// conformance/bundles/<n>/<stem>.steps.go, symlinked into ../conformance/bNN
// (each its own `package fixture`), and dispatched by bundle name below.
package conformance_test

import (
	"os"
	"path/filepath"
	"sort"
	"testing"

	"github.com/varar-dev/varar/go/core"
	"github.com/varar-dev/varar/go/varar"

	b01 "github.com/varar-dev/varar/go/conformance/b01"
	b02 "github.com/varar-dev/varar/go/conformance/b02"
	b03 "github.com/varar-dev/varar/go/conformance/b03"
	b04 "github.com/varar-dev/varar/go/conformance/b04"
	b05 "github.com/varar-dev/varar/go/conformance/b05"
	b06 "github.com/varar-dev/varar/go/conformance/b06"
	b07 "github.com/varar-dev/varar/go/conformance/b07"
	b08 "github.com/varar-dev/varar/go/conformance/b08"
	b09 "github.com/varar-dev/varar/go/conformance/b09"
	b10 "github.com/varar-dev/varar/go/conformance/b10"
	b11 "github.com/varar-dev/varar/go/conformance/b11"
	b12 "github.com/varar-dev/varar/go/conformance/b12"
	b13 "github.com/varar-dev/varar/go/conformance/b13"
	b14 "github.com/varar-dev/varar/go/conformance/b14"
	b15 "github.com/varar-dev/varar/go/conformance/b15"
	b16 "github.com/varar-dev/varar/go/conformance/b16"
	b17 "github.com/varar-dev/varar/go/conformance/b17"
	b18 "github.com/varar-dev/varar/go/conformance/b18"
)

type fixture struct {
	register func(*varar.Steps[varar.Value])
	state    func() varar.Value
}

var fixtures = map[string]fixture{
	"01-roman-numerals":             {b01.Register, b01.State},
	"02-context-isolation":          {b02.Register, b02.State},
	"03-expected-failure":           {b03.Register, b03.State},
	"04-tables-and-docstrings":      {b04.Register, b04.State},
	"05-ambiguous-match":            {b05.Register, b05.State},
	"06-doc-string-mismatch":        {b06.Register, b06.State},
	"07-row-check-mismatch":         {b07.Register, b07.State},
	"08-string-capture":             {b08.Register, b08.State},
	"09-expected-message-mismatch":  {b09.Register, b09.State},
	"10-error-fence-without-step":   {b10.Register, b10.State},
	"11-emoji-offsets":              {b11.Register, b11.State},
	"12-combining-marks":            {b12.Register, b12.State},
	"13-custom-parameter-type":      {b13.Register, b13.State},
	"14-stateless-steps":            {b14.Register, b14.State},
	"15-custom-parameter-format":    {b15.Register, b15.State},
	"16-stimulus-state-replacement": {b16.Register, b16.State},
	"17-unexpected-pass":            {b17.Register, b17.State},
	"18-multi-table-example":        {b18.Register, b18.State},
}

func bundlesDir() string { return filepath.Join("..", "..", "conformance", "bundles") }

func bundleNames(t *testing.T) []string {
	t.Helper()
	entries, err := os.ReadDir(bundlesDir())
	if err != nil {
		t.Fatalf("read bundles: %v", err)
	}
	var names []string
	for _, e := range entries {
		if e.IsDir() {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	return names
}

func golden(t *testing.T, name, artifact string) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(bundlesDir(), name, "golden", artifact))
	if err != nil {
		t.Fatalf("read golden %s/%s: %v", name, artifact, err)
	}
	return string(b)
}

func registryFor(t *testing.T, name string) core.Registry {
	t.Helper()
	f, ok := fixtures[name]
	if !ok {
		t.Fatalf("no Go step fixture for bundle %s", name)
	}
	s := varar.NewSteps[varar.Value]()
	f.register(s)
	return s.Registry()
}

func sourceOf(t *testing.T, name string) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(bundlesDir(), name, "example.md"))
	if err != nil {
		t.Fatalf("read example.md %s: %v", name, err)
	}
	return string(b)
}

func TestRegistryMatchesGolden(t *testing.T) {
	for _, name := range bundleNames(t) {
		t.Run(name, func(t *testing.T) {
			reg := registryFor(t, name)
			actual := core.CanonicalStringify(core.ToRegistryArtifact(reg))
			if want := golden(t, name, "registry.json"); actual != want {
				t.Errorf("registry.json mismatch for %s\n--- got ---\n%s\n--- want ---\n%s", name, actual, want)
			}
		})
	}
}

func TestPlanMatchesGolden(t *testing.T) {
	for _, name := range bundleNames(t) {
		t.Run(name, func(t *testing.T) {
			reg := registryFor(t, name)
			doc := core.Parse("example.md", sourceOf(t, name))
			plan := core.Plan(doc, reg)
			actual := core.CanonicalStringify(core.ToPlanArtifact(plan))
			if want := golden(t, name, "plan.json"); actual != want {
				t.Errorf("plan.json mismatch for %s\n--- got ---\n%s\n--- want ---\n%s", name, actual, want)
			}
		})
	}
}

func TestTraceMatchesGolden(t *testing.T) {
	for _, name := range bundleNames(t) {
		t.Run(name, func(t *testing.T) {
			f := fixtures[name]
			s := varar.NewSteps[varar.Value]()
			f.register(s)
			doc := core.Parse("example.md", sourceOf(t, name))
			artifacts := core.RunConformance(doc, s.Registry(), func() any { return f.state() })
			actual := core.CanonicalStringify(artifacts.Trace)
			if want := golden(t, name, "trace.json"); actual != want {
				t.Errorf("trace.json mismatch for %s\n--- got ---\n%s\n--- want ---\n%s", name, actual, want)
			}
		})
	}
}
