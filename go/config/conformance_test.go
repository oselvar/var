package config_test

import (
	"os"
	"path/filepath"
	"sort"
	"testing"

	"github.com/varar-dev/varar/go/config"
	"github.com/varar-dev/varar/go/core"
)

// The var-config conformance corpus at conformance/config/cases/*: each case has
// a varar.config.json plus either a golden.json (parse succeeds → project to the
// canonical shape, canonical-serialize, byte-compare) or an expect-error.txt
// marker (loading must fail; the txt is human-only, not asserted).

func casesDir() string { return filepath.Join("..", "..", "conformance", "config", "cases") }

func strList(ss []string) core.Value {
	vs := make([]core.Value, len(ss))
	for i, s := range ss {
		vs[i] = core.StrValue(s)
	}
	return core.ListOf(vs)
}

func toConfigArtifact(cfg config.VarConfig) core.Value {
	snippets := map[string]core.Value{}
	for k, v := range cfg.Snippets {
		snippets[k] = core.StrValue(v)
	}
	docs := core.MapValue(map[string]core.Value{
		"include": strList(cfg.DocsInclude),
		"exclude": strList(cfg.DocsExclude),
	})
	return core.MapValue(map[string]core.Value{
		"docs":     docs,
		"steps":    strList(cfg.Steps),
		"snippets": core.MapValue(snippets),
	})
}

func TestConfigConformance(t *testing.T) {
	entries, err := os.ReadDir(casesDir())
	if err != nil {
		t.Fatalf("read cases: %v", err)
	}
	var names []string
	for _, e := range entries {
		if e.IsDir() {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)

	for _, name := range names {
		t.Run(name, func(t *testing.T) {
			dir := filepath.Join(casesDir(), name)
			if _, err := os.Stat(filepath.Join(dir, "expect-error.txt")); err == nil {
				if _, err := config.ReadVarConfig(dir); err == nil {
					t.Errorf("%s: expected an error, got none", name)
				}
				return
			}
			goldenBytes, err := os.ReadFile(filepath.Join(dir, "golden.json"))
			if err != nil {
				t.Fatalf("%s: no golden.json and no expect-error.txt", name)
			}
			cfg, err := config.ReadVarConfig(dir)
			if err != nil {
				t.Fatalf("%s: unexpected error: %v", name, err)
			}
			actual := core.CanonicalStringify(toConfigArtifact(cfg))
			if actual != string(goldenBytes) {
				t.Errorf("%s: golden mismatch\n--- got ---\n%s\n--- want ---\n%s", name, actual, string(goldenBytes))
			}
		})
	}
}
