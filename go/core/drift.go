package core

import (
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// Spec drift detection — port of drift.ts / drift.rs. A paragraph the committed
// varar.lock.json baseline recorded as an example that now matches no step.
// Byte-identical to the other ports (FNV-1a fingerprint, insertion-ordered
// lockfile serializer, Jaccard word-similarity re-identification).

// DriftSimilarityThreshold is the word-similarity threshold for re-identifying a
// moved/reworded example.
const DriftSimilarityThreshold = 0.5

// BaselineExample is one example-producing paragraph, as recorded in the baseline.
type BaselineExample struct {
	Name string
	Line int
}

// SpecBaseline is the committed baseline for one spec file.
type SpecBaseline struct {
	SourceHash string
	Examples   []BaselineExample
}

// VarLock is the whole varar.lock.json: every spec keyed by its POSIX path.
type VarLock struct {
	Version int
	Specs   map[string]SpecBaseline
}

// Drifted is a paragraph the baseline says was an example and now matches no step.
type Drifted struct {
	Name string
	Line int
	Span Span
}

// BaselineStore is the persistence port for varar.lock.json. The core owns the
// format; adapters move only raw text.
type BaselineStore interface {
	// Read returns the whole lockfile's contents, or ok=false when there is no
	// baseline yet.
	Read() (string, bool)
	Write(contents string)
}

var tokenRE = regexp.MustCompile(`[\p{L}\p{N}]+`)

// overlaps reports whether the two spans' offset ranges intersect. A candidate
// paragraph relates to its planned example either way round: a header-bound row
// sits inside its binding paragraph, while a merged example's span covers each
// of the candidates it absorbed (ADR 0012). Overlap catches both.
func overlaps(a, b Span) bool {
	return a.StartOffset < b.EndOffset && b.StartOffset < a.EndOffset
}

// isLive reports whether a candidate paragraph is still an example: it overlaps
// at least one planned example. A now-prose paragraph — one whose step def was
// renamed or deleted — overlaps none (it became a delimiter, splitting any
// example it was part of), so drift catches it.
func isLive(candidateSpan Span, plan ExecutionPlan) bool {
	for _, pe := range plan.Examples {
		if overlaps(pe.Span, candidateSpan) {
			return true
		}
	}
	return false
}

func tokenize(text string) map[string]struct{} {
	out := map[string]struct{}{}
	for _, m := range tokenRE.FindAllString(strings.ToLower(text), -1) {
		out[m] = struct{}{}
	}
	return out
}

func similarity(a, b map[string]struct{}) float64 {
	if len(a) == 0 && len(b) == 0 {
		return 1.0
	}
	intersection := 0
	for t := range a {
		if _, ok := b[t]; ok {
			intersection++
		}
	}
	union := len(a) + len(b) - intersection
	if union == 0 {
		return 0.0
	}
	return float64(intersection) / float64(union)
}

// LiveExamples returns the current example-producing paragraphs, in document order.
func LiveExamples(varDoc VarDoc, plan ExecutionPlan) []BaselineExample {
	var out []BaselineExample
	for _, c := range varDoc.Examples {
		if isLive(c.Span, plan) {
			out = append(out, BaselineExample{Name: deriveExampleName(c.Body), Line: c.Span.StartLine})
		}
	}
	return out
}

// DeriveSpecBaseline is the full baseline record for a spec: fingerprint plus
// live examples.
func DeriveSpecBaseline(source string, varDoc VarDoc, plan ExecutionPlan) SpecBaseline {
	return SpecBaseline{SourceHash: HashSource(source), Examples: LiveExamples(varDoc, plan)}
}

// DetectDrift returns paragraphs the baseline recorded as examples that now
// match zero steps.
func DetectDrift(baseline *SpecBaseline, varDoc VarDoc, plan ExecutionPlan) []Drifted {
	if baseline == nil {
		return nil
	}
	candidates := varDoc.Examples
	n := len(candidates)
	tokens := make([]map[string]struct{}, n)
	live := make([]bool, n)
	for i, c := range candidates {
		tokens[i] = tokenize(deriveExampleName(c.Body))
		live[i] = isLive(c.Span, plan)
	}

	var drifts []Drifted
	for _, b := range baseline.Examples {
		bTokens := tokenize(b.Name)
		bestIdx := -1
		bestScore := 0.0
		for i := 0; i < n; i++ {
			score := similarity(bTokens, tokens[i])
			if score < DriftSimilarityThreshold {
				continue
			}
			line := candidates[i].Span.StartLine
			bestLine := 0
			if bestIdx >= 0 {
				bestLine = candidates[bestIdx].Span.StartLine
			}
			if bestIdx < 0 ||
				score > bestScore ||
				(score == bestScore && absInt(line-b.Line) < absInt(bestLine-b.Line)) {
				bestIdx = i
				bestScore = score
			}
		}
		if bestIdx >= 0 && !live[bestIdx] {
			cand := candidates[bestIdx]
			drifts = append(drifts, Drifted{Name: b.Name, Line: cand.Span.StartLine, Span: cand.Span})
		}
	}
	return drifts
}

func absInt(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

// DriftMessage is the human-readable message for a drift.
func DriftMessage(drifted Drifted) string {
	return fmt.Sprintf(
		"This paragraph was an example and no longer matches any step (drift): %q.\nFix the step so it matches again, or accept it as prose (run in update mode).",
		drifted.Name,
	)
}

// ReconcileDrift is one spec's baseline reconciliation against a BaselineStore.
// update accepts all drift; otherwise detect drift and rewrite the baseline only
// on a clean run.
func ReconcileDrift(store BaselineStore, specPath, source string, varDoc VarDoc, plan ExecutionPlan, update bool) []Drifted {
	var lock *VarLock
	if contents, ok := store.Read(); ok {
		lock = ParseVarLock(contents)
	}
	var drifts []Drifted
	if !update {
		var baseline *SpecBaseline
		if lock != nil {
			if b, ok := lock.Specs[specPath]; ok {
				baseline = &b
			}
		}
		drifts = DetectDrift(baseline, varDoc, plan)
	}
	if update || len(drifts) == 0 {
		next := DeriveSpecBaseline(source, varDoc, plan)
		specs := map[string]SpecBaseline{}
		if lock != nil {
			specs = lock.Specs
		}
		specs[specPath] = next
		store.Write(StringifyVarLock(VarLock{Version: 1, Specs: specs}))
	}
	return drifts
}

// StringifyVarLock serializes varar.lock.json deterministically (fixed field
// order, sorted spec paths, two-space indent, trailing newline) — NOT the
// recursive canonical JSON.
func StringifyVarLock(lock VarLock) string {
	var sb strings.Builder
	sb.WriteString("{\n  \"version\": 1,\n  \"specs\": ")
	if len(lock.Specs) == 0 {
		sb.WriteString("{}")
	} else {
		sb.WriteString("{\n")
		paths := make([]string, 0, len(lock.Specs))
		for p := range lock.Specs {
			paths = append(paths, p)
		}
		sort.Strings(paths)
		for pi, path := range paths {
			baseline := lock.Specs[path]
			sb.WriteString("    ")
			writeString(&sb, path)
			sb.WriteString(": {\n      \"sourceHash\": ")
			writeString(&sb, baseline.SourceHash)
			sb.WriteString(",\n      \"examples\": ")
			if len(baseline.Examples) == 0 {
				sb.WriteString("[]")
			} else {
				sb.WriteString("[\n")
				for e, ex := range baseline.Examples {
					sb.WriteString("        {\n          \"name\": ")
					writeString(&sb, ex.Name)
					sb.WriteString(",\n          \"line\": ")
					sb.WriteString(strconv.Itoa(ex.Line))
					sb.WriteString("\n        }")
					if e+1 < len(baseline.Examples) {
						sb.WriteByte(',')
					}
					sb.WriteByte('\n')
				}
				sb.WriteString("      ]")
			}
			sb.WriteString("\n    }")
			if pi+1 < len(paths) {
				sb.WriteByte(',')
			}
			sb.WriteByte('\n')
		}
		sb.WriteString("  }")
	}
	sb.WriteString("\n}\n")
	return sb.String()
}

// ParseVarLock parses varar.lock.json; nil on malformed input (treated as no
// baseline).
func ParseVarLock(text string) *VarLock {
	type jsonExample struct {
		Name *string `json:"name"`
		Line *int    `json:"line"`
	}
	type jsonSpec struct {
		SourceHash *string        `json:"sourceHash"`
		Examples   *[]jsonExample `json:"examples"`
	}
	type jsonLock struct {
		Version *int                `json:"version"`
		Specs   map[string]jsonSpec `json:"specs"`
	}
	var raw jsonLock
	if err := json.Unmarshal([]byte(text), &raw); err != nil {
		return nil
	}
	if raw.Version == nil || *raw.Version != 1 || raw.Specs == nil {
		return nil
	}
	specs := map[string]SpecBaseline{}
	for k, v := range raw.Specs {
		if v.SourceHash == nil || v.Examples == nil {
			return nil
		}
		examples := make([]BaselineExample, 0, len(*v.Examples))
		for _, e := range *v.Examples {
			if e.Name == nil || e.Line == nil {
				return nil
			}
			examples = append(examples, BaselineExample{Name: *e.Name, Line: *e.Line})
		}
		specs[k] = SpecBaseline{SourceHash: *v.SourceHash, Examples: examples}
	}
	return &VarLock{Version: 1, Specs: specs}
}
