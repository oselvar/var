// Package varrunner is the imperative shell shared by var test-runner adapters:
// spec discovery (the shared glob semantics), planning/running examples, failure
// rendering, and the filesystem varar.lock.json baseline store for drift. It
// contains no pipeline logic — it delegates to varcore. Steps are supplied by
// the caller (Go compiles step files in; there is no dynamic load_steps) as a
// Registry plus a context factory.
package varrunner

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	varconfig "github.com/varar-dev/varar-go/config"
)

// GlobToRegex translates a glob (`/**/`, `/**`, `**/`, `**`, `*`, `?`) to an
// anchored regex, matching the other runners byte-for-byte.
func GlobToRegex(pattern string) *regexp.Regexp {
	chars := []rune(pattern)
	n := len(chars)
	starts := func(i int, pat string) bool {
		pr := []rune(pat)
		for k, pc := range pr {
			if i+k >= n || chars[i+k] != pc {
				return false
			}
		}
		return true
	}

	var out strings.Builder
	out.WriteByte('^')
	i := 0
	for i < n {
		switch {
		case chars[i] == '/' && starts(i, "/**/"):
			out.WriteString("/(?:.+/)?")
			i += 4
		case chars[i] == '/' && starts(i, "/**") && i+3 == n:
			out.WriteString("(?:/.*)?")
			i += 3
		case chars[i] == '*' && starts(i, "**/"):
			out.WriteString("(?:.*/)?")
			i += 3
		case chars[i] == '*' && starts(i, "**"):
			out.WriteString(".*")
			i += 2
		case chars[i] == '*':
			out.WriteString("[^/]*")
			i++
		case chars[i] == '?':
			out.WriteString("[^/]")
			i++
		default:
			out.WriteString(regexp.QuoteMeta(string(chars[i])))
			i++
		}
	}
	out.WriteByte('$')
	return regexp.MustCompile(out.String())
}

func matchesAny(rel string, globs []string) bool {
	for _, g := range globs {
		if GlobToRegex(g).MatchString(rel) {
			return true
		}
	}
	return false
}

// relPosix is path relative to root, forward-slashed. Falls back to the file
// name when path is not under root.
func relPosix(path, root string) string {
	rel, err := filepath.Rel(root, path)
	if err != nil {
		rel = filepath.Base(path)
	}
	return filepath.ToSlash(rel)
}

// MatchSpec reports whether path (relative to root) matches an include glob and
// no exclude.
func MatchSpec(path string, include, exclude []string, root string) bool {
	rel := relPosix(path, root)
	return matchesAny(rel, include) && !matchesAny(rel, exclude)
}

func walk(dir string, out *[]string) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	for _, e := range entries {
		p := filepath.Join(dir, e.Name())
		// os.Stat follows symlinks, matching the other runners' is_dir/is_file
		// (a symlinked `.md` spec must be discovered).
		info, err := os.Stat(p)
		if err != nil {
			continue
		}
		if info.IsDir() {
			walk(p, out)
		} else if info.Mode().IsRegular() {
			*out = append(*out, p)
		}
	}
}

// FindSpecs returns files under root matching any docs.include glob and no
// docs.exclude glob, sorted.
func FindSpecs(config varconfig.VarConfig, root string) []string {
	var files []string
	walk(root, &files)
	var kept []string
	for _, p := range files {
		if MatchSpec(p, config.DocsInclude, config.DocsExclude, root) {
			kept = append(kept, p)
		}
	}
	sort.Strings(kept)
	return kept
}
