package varcore

import (
	"os"
	"path/filepath"
	"sort"
	"testing"
)

// bundlesDir is the shared corpus, a sibling of go/ at the repo root.
func bundlesDir(t *testing.T) string {
	t.Helper()
	return filepath.Join("..", "..", "conformance", "bundles")
}

func bundleDirs(t *testing.T) []string {
	t.Helper()
	entries, err := os.ReadDir(bundlesDir(t))
	if err != nil {
		t.Fatalf("read bundles: %v", err)
	}
	var dirs []string
	for _, e := range entries {
		if e.IsDir() {
			dirs = append(dirs, filepath.Join(bundlesDir(t), e.Name()))
		}
	}
	sort.Strings(dirs)
	return dirs
}

func readFile(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	return string(b)
}

func TestVarDocMatchesGolden(t *testing.T) {
	for _, dir := range bundleDirs(t) {
		name := filepath.Base(dir)
		t.Run(name, func(t *testing.T) {
			source := readFile(t, filepath.Join(dir, "example.md"))
			doc := Parse("example.md", source)
			actual := CanonicalStringify(ToVarDocArtifact(doc))
			golden := readFile(t, filepath.Join(dir, "golden", "var-doc.json"))
			if actual != golden {
				t.Errorf("var-doc.json mismatch for %s\n--- got ---\n%s\n--- want ---\n%s", name, actual, golden)
			}
		})
	}
}
