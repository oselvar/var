package core

import (
	"reflect"
	"testing"
)

// Port of the plan.test.ts / e2e.test.ts example-delimiter tests (ADR 0012).

// bankReg registers the three banking stimuli used by the delimiter tests.
func bankReg(t *testing.T) Registry {
	t.Helper()
	r := CreateRegistry()
	for _, expr := range []string{
		"I have {int} in my account",
		"I withdraw {int}",
		"I should have {int} left",
	} {
		next, err := AddStep(r, expr, "steps.ts", 1, NoopHandler(), stimulusKind())
		if err != nil {
			t.Fatalf("add step %q: %v", expr, err)
		}
		r = next
	}
	return r
}

func stepTexts(ex PlannedExample) []string {
	out := make([]string, len(ex.Steps))
	for i, s := range ex.Steps {
		out[i] = s.Text
	}
	return out
}

func TestConsecutiveMatchingParagraphsMergeIntoOneExample(t *testing.T) {
	source := "I have 100 in my account.\n\nI withdraw 40.\n\nI should have 60 left."
	result := Plan(Parse("m.md", source), bankReg(t))
	if len(result.Examples) != 1 {
		t.Fatalf("expected 1 example, got %d", len(result.Examples))
	}
	got := stepTexts(result.Examples[0])
	want := []string{"I have 100 in my account", "I withdraw 40", "I should have 60 left"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("steps got %v, want %v", got, want)
	}
	// The name is the first matching paragraph's text.
	if result.Examples[0].Name != "I have 100 in my account" {
		t.Errorf("name got %q", result.Examples[0].Name)
	}
}

func TestThematicBreakSplitsMatchingParagraphs(t *testing.T) {
	source := "I have 100 in my account.\n\n---\n\nI withdraw 40."
	result := Plan(Parse("h.md", source), bankReg(t))
	if len(result.Examples) != 2 {
		t.Fatalf("expected 2 examples, got %d", len(result.Examples))
	}
	if !reflect.DeepEqual(stepTexts(result.Examples[0]), []string{"I have 100 in my account"}) ||
		!reflect.DeepEqual(stepTexts(result.Examples[1]), []string{"I withdraw 40"}) {
		t.Errorf("unexpected split: %v / %v", stepTexts(result.Examples[0]), stepTexts(result.Examples[1]))
	}
}

func TestHeadingSplitsMatchingParagraphs(t *testing.T) {
	source := "I have 100 in my account.\n\n## Next\n\nI withdraw 40."
	result := Plan(Parse("hd.md", source), bankReg(t))
	if len(result.Examples) != 2 {
		t.Fatalf("expected 2 examples, got %d", len(result.Examples))
	}
	if !reflect.DeepEqual(result.Examples[1].ScopeStack, []string{"Next"}) {
		t.Errorf("scope got %v", result.Examples[1].ScopeStack)
	}
}

func TestProseBetweenMatchingParagraphsSplitsTheExample(t *testing.T) {
	source := "I have 100 in my account.\n\nJust explaining what happens next.\n\nI withdraw 40."
	result := Plan(Parse("p.md", source), bankReg(t))
	if len(result.Examples) != 2 {
		t.Fatalf("expected 2 examples, got %d", len(result.Examples))
	}
	if !reflect.DeepEqual(stepTexts(result.Examples[0]), []string{"I have 100 in my account"}) ||
		!reflect.DeepEqual(stepTexts(result.Examples[1]), []string{"I withdraw 40"}) {
		t.Errorf("unexpected split: %v / %v", stepTexts(result.Examples[0]), stepTexts(result.Examples[1]))
	}
}

func TestLeadingAndTrailingProseDoesNotMerge(t *testing.T) {
	source := "A preamble that matches nothing.\n\nI withdraw 40.\n\nA closing remark."
	result := Plan(Parse("pp.md", source), bankReg(t))
	if len(result.Examples) != 1 {
		t.Fatalf("expected 1 example, got %d", len(result.Examples))
	}
	if !reflect.DeepEqual(stepTexts(result.Examples[0]), []string{"I withdraw 40"}) {
		t.Errorf("steps got %v", stepTexts(result.Examples[0]))
	}
}

func TestConsecutiveListItemsMergeIntoOneExample(t *testing.T) {
	r := CreateRegistry()
	for _, expr := range []string{"I have {int} in my account", "I withdraw {int}"} {
		next, err := AddStep(r, expr, "steps.ts", 1, NoopHandler(), stimulusKind())
		if err != nil {
			t.Fatalf("add step %q: %v", expr, err)
		}
		r = next
	}
	// Two list items, no delimiter between them → one example, shared state.
	source := "# Bullets\n\n- Given I have 100 in my account\n- When I withdraw 40"
	result := Plan(Parse("b.md", source), r)
	if len(result.Examples) != 1 {
		t.Fatalf("expected 1 example, got %d", len(result.Examples))
	}
	want := []string{"I have 100 in my account", "I withdraw 40"}
	if !reflect.DeepEqual(stepTexts(result.Examples[0]), want) {
		t.Errorf("steps got %v, want %v", stepTexts(result.Examples[0]), want)
	}
}

func TestAmbiguousMatchProducesNoRunnableExample(t *testing.T) {
	r := CreateRegistry()
	r1, err := AddStep(r, "I have {int} cukes", "steps.ts", 1, NoopHandler(), stimulusKind())
	if err != nil {
		t.Fatal(err)
	}
	r2, err := AddStep(r1, "I have {word} cukes", "steps.ts", 2, NoopHandler(), stimulusKind())
	if err != nil {
		t.Fatal(err)
	}
	result := Plan(Parse("a.md", "I have 42 cukes."), r2)
	if len(result.Diagnostics) != 1 {
		t.Fatalf("expected 1 diagnostic, got %d", len(result.Diagnostics))
	}
	if result.Diagnostics[0].Code != CodeAmbiguousMatch {
		t.Errorf("diagnostic code %v", result.Diagnostics[0].Code)
	}
	// An ambiguous candidate has no runnable step, so it is prose (a delimiter),
	// not an example — the diagnostic is the signal. See ADR 0012.
	if len(result.Examples) != 0 {
		t.Errorf("expected 0 examples, got %d", len(result.Examples))
	}
}

func TestMultiTableShapeSurvivesBlankLines(t *testing.T) {
	r := CreateRegistry()
	for i, expr := range []string{
		"the following users have been imported",
		"the following assets have been imported",
	} {
		next, err := AddStep(r, expr, "s.ts", i+1, NoopHandler(), stimulusKind())
		if err != nil {
			t.Fatalf("add step %q: %v", expr, err)
		}
		r = next
	}
	source := "Given the following users have been imported:\n\n" +
		"| email | name |\n| ----- | ---- |\n| a@b.c | Ada  |\n\n" +
		"And the following assets have been imported:\n\n" +
		"| name  |\n| ----- |\n| Moose |"
	result := Plan(Parse("basket.md", source), r)
	if len(result.Examples) != 1 {
		t.Fatalf("expected 1 example, got %d", len(result.Examples))
	}
	ex := result.Examples[0]
	if len(ex.Steps) != 2 {
		t.Fatalf("expected 2 steps, got %d", len(ex.Steps))
	}
	if ex.Steps[0].DataTable == nil || len(ex.Steps[0].DataTable.Rows) != 1 {
		t.Errorf("step 0 table rows unexpected")
	}
	if ex.Steps[1].DataTable == nil || len(ex.Steps[1].DataTable.Rows) != 1 {
		t.Errorf("step 1 table rows unexpected")
	}
}
