package gotest_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/varar-dev/varar-go/core"
	"github.com/varar-dev/varar-go/gotest"
)

func withStep() core.Registry {
	k := core.Stimulus
	r, err := core.AddStep(core.CreateRegistry(), "I greet {string}", "s.go", 1,
		core.NewHandler(func(state any, args []core.Value) (any, error) { return nil, nil }), &k)
	if err != nil {
		panic(err)
	}
	return r
}

func emptyReg() core.Registry { return core.CreateRegistry() }

func nullContext(string) any { return core.NullValue }

func setup(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	os.WriteFile(filepath.Join(root, "varar.config.json"), []byte(`{"docs":{"include":["*.md"]}}`), 0o644)
	os.WriteFile(filepath.Join(root, "spec.md"), []byte("I greet \"world\"."), 0o644)
	return root
}

func TestCollectEnumeratesOnePassingExample(t *testing.T) {
	root := setup(t)
	cases, err := gotest.Collect(root, withStep, nullContext, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(cases) != 1 {
		t.Fatalf("expected 1 case, got %d: %+v", len(cases), cases)
	}
	if cases[0].DriftMessage != "" {
		t.Errorf("unexpected drift: %s", cases[0].DriftMessage)
	}
	// A clean run writes the baseline.
	if _, err := os.Stat(filepath.Join(root, "varar.lock.json")); err != nil {
		t.Error("expected varar.lock.json to be written")
	}
}

func TestCollectReportsDriftWhenStepRemoved(t *testing.T) {
	root := setup(t)
	// First, a clean run with the step records the baseline.
	if _, err := gotest.Collect(root, withStep, nullContext, false); err != nil {
		t.Fatal(err)
	}
	// Now the step is gone: the paragraph matches nothing → drift.
	cases, err := gotest.Collect(root, emptyReg, nullContext, false)
	if err != nil {
		t.Fatal(err)
	}
	var drift *gotest.Case
	for i := range cases {
		if cases[i].DriftMessage != "" {
			drift = &cases[i]
		}
	}
	if drift == nil {
		t.Fatalf("expected a drift case, got %+v", cases)
	}
	if !strings.Contains(drift.Name, "var:drift:") {
		t.Errorf("drift case name: %s", drift.Name)
	}
}

func TestUpdateModeAcceptsDrift(t *testing.T) {
	root := setup(t)
	if _, err := gotest.Collect(root, withStep, nullContext, false); err != nil {
		t.Fatal(err)
	}
	cases, err := gotest.Collect(root, emptyReg, nullContext, true)
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range cases {
		if c.DriftMessage != "" {
			t.Errorf("update mode should accept drift, got %s", c.DriftMessage)
		}
	}
}
