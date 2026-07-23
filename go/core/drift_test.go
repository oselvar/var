package core

import (
	"fmt"
	"reflect"
	"strings"
	"testing"
)

// Port of drift.test.ts / DriftTest.java (unit-gated; drift has no golden).

func stimulusKind() *StepKind { k := Stimulus; return &k }
func sensorKind() *StepKind   { k := Sensor; return &k }

func reg(withStep bool) Registry {
	r := CreateRegistry()
	if withStep {
		next, err := AddStep(r, "I withdraw {int}", "steps.ts", 1, NoopHandler(), stimulusKind())
		if err != nil {
			panic(err)
		}
		return next
	}
	return r
}

func romanReg(withStep bool) Registry {
	r := CreateRegistry()
	if withStep {
		next, err := AddStep(r, "a decimal and a roman number", "steps.ts", 1, NoopHandler(), sensorKind())
		if err != nil {
			panic(err)
		}
		return next
	}
	return r
}

func planOf(source string, r Registry) ExecutionPlan {
	return Plan(Parse("w.md", source), r)
}

func bare(drifts []Drifted) []string {
	out := []string{}
	for _, d := range drifts {
		out = append(out, fmt.Sprintf("%s@%d", d.Name, d.Line))
	}
	return out
}

type memoryStore struct {
	contents *string
}

func (m *memoryStore) Read() (string, bool) {
	if m.contents == nil {
		return "", false
	}
	return *m.contents, true
}
func (m *memoryStore) Write(c string) { s := c; m.contents = &s }

func libraryLock() VarLock {
	return VarLock{Version: 1, Specs: map[string]SpecBaseline{
		"library.md": {SourceHash: "fnv1a:1a2b3c4d", Examples: []BaselineExample{{Name: "I check out", Line: 7}}},
	}}
}

func TestLiveExamplesRecordsOnePerParagraph(t *testing.T) {
	varDoc := Parse("w.md", "I withdraw 40.")
	got := LiveExamples(varDoc, planOf("I withdraw 40.", reg(true)))
	want := []BaselineExample{{Name: "I withdraw 40", Line: 1}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestDeriveSpecBaselineCarriesFingerprint(t *testing.T) {
	source := "I withdraw 40."
	varDoc := Parse("w.md", source)
	baseline := DeriveSpecBaseline(source, varDoc, planOf(source, reg(true)))
	if baseline.SourceHash != HashSource(source) {
		t.Errorf("hash mismatch")
	}
	want := []BaselineExample{{Name: "I withdraw 40", Line: 1}}
	if !reflect.DeepEqual(baseline.Examples, want) {
		t.Errorf("got %v, want %v", baseline.Examples, want)
	}
}

func TestNoBaselineMeansNoDrift(t *testing.T) {
	varDoc := Parse("w.md", "I withdraw 40.")
	if d := DetectDrift(nil, varDoc, planOf("I withdraw 40.", reg(true))); len(d) != 0 {
		t.Errorf("expected no drift, got %v", bare(d))
	}
}

func TestRenamedStepDrifts(t *testing.T) {
	source := "I withdraw 40."
	varDoc := Parse("w.md", source)
	baseline := DeriveSpecBaseline(source, varDoc, planOf(source, reg(true)))
	got := bare(DetectDrift(&baseline, varDoc, planOf(source, reg(false))))
	if !reflect.DeepEqual(got, []string{"I withdraw 40@1"}) {
		t.Errorf("got %v", got)
	}
}

func TestInPlaceTypoDrifts(t *testing.T) {
	before := "I withdraw 40."
	baseline := DeriveSpecBaseline(before, Parse("w.md", before), planOf(before, reg(true)))
	after := "I withdrraw 40."
	afterDoc := Parse("w.md", after)
	got := bare(DetectDrift(&baseline, afterDoc, planOf(after, reg(true))))
	if !reflect.DeepEqual(got, []string{"I withdraw 40@1"}) {
		t.Errorf("got %v", got)
	}
}

func TestDeletedParagraphIsNotDrift(t *testing.T) {
	before := "I withdraw 40."
	baseline := DeriveSpecBaseline(before, Parse("w.md", before), planOf(before, reg(true)))
	afterDoc := Parse("w.md", "")
	if d := DetectDrift(&baseline, afterDoc, planOf("", reg(true))); len(d) != 0 {
		t.Errorf("expected no drift, got %v", bare(d))
	}
}

func TestMovingAndRewordingStillMatchingDoesNotDrift(t *testing.T) {
	before := "I withdraw 40.\n\nI withdraw 10."
	baseline := DeriveSpecBaseline(before, Parse("w.md", before), planOf(before, reg(true)))
	after := "I withdraw 11.\n\nI withdraw 40."
	if d := DetectDrift(&baseline, Parse("w.md", after), planOf(after, reg(true))); len(d) != 0 {
		t.Errorf("expected no drift, got %v", bare(d))
	}
}

func TestMoveRewordProseOnOldLineNoFalsePositive(t *testing.T) {
	before := "I withdraw 40."
	baseline := DeriveSpecBaseline(before, Parse("w.md", before), planOf(before, reg(true)))
	after := "Just some notes.\n\nI withdraw 41."
	if d := DetectDrift(&baseline, Parse("w.md", after), planOf(after, reg(true))); len(d) != 0 {
		t.Errorf("expected no drift, got %v", bare(d))
	}
}

func TestRewrittenPastRecognitionIsNotDrift(t *testing.T) {
	before := "I withdraw 40."
	baseline := DeriveSpecBaseline(before, Parse("w.md", before), planOf(before, reg(true)))
	after := "The branch closed years ago."
	if d := DetectDrift(&baseline, Parse("w.md", after), planOf(after, reg(true))); len(d) != 0 {
		t.Errorf("expected no drift, got %v", bare(d))
	}
}

// depositWithdrawReg registers I withdraw, plus I deposit when withDeposit.
func depositWithdrawReg(t *testing.T, withDeposit bool) Registry {
	t.Helper()
	r := CreateRegistry()
	if withDeposit {
		next, err := AddStep(r, "I deposit {int}", "steps.ts", 1, NoopHandler(), stimulusKind())
		if err != nil {
			t.Fatal(err)
		}
		r = next
	}
	next, err := AddStep(r, "I withdraw {int}", "steps.ts", 2, NoopHandler(), stimulusKind())
	if err != nil {
		t.Fatal(err)
	}
	return next
}

// Two paragraphs that merge into one example are each a live baseline entry, and
// deleting one step def drifts only the now-prose paragraph (ADR 0012).
func TestMergedExampleParagraphsAreEachLive(t *testing.T) {
	source := "I deposit 100.\n\nI withdraw 40."
	varDoc := Parse("w.md", source)
	plan := Plan(varDoc, depositWithdrawReg(t, true))
	// One planned example (the two paragraphs merged), but two live entries.
	if len(plan.Examples) != 1 {
		t.Fatalf("expected 1 planned example, got %d", len(plan.Examples))
	}
	got := LiveExamples(varDoc, plan)
	want := []BaselineExample{{Name: "I deposit 100", Line: 1}, {Name: "I withdraw 40", Line: 3}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("live got %v, want %v", got, want)
	}
}

func TestDeletingOneStepOfMergedExampleDriftsOnlyNowProseParagraph(t *testing.T) {
	source := "I deposit 100.\n\nI withdraw 40."
	varDoc := Parse("w.md", source)
	baseline := DeriveSpecBaseline(source, varDoc, Plan(varDoc, depositWithdrawReg(t, true)))
	// The deposit step is gone: its paragraph becomes prose, splitting the
	// example. The withdraw paragraph is still live; the deposit one drifts.
	got := bare(DetectDrift(&baseline, varDoc, Plan(varDoc, depositWithdrawReg(t, false))))
	if !reflect.DeepEqual(got, []string{"I deposit 100@1"}) {
		t.Errorf("got %v", got)
	}
}

const roman = "Each row gives a decimal and a roman number:\n\n| decimal | roman |\n| ------: | :---- |\n| 3 | III |\n| 9 | IX |\n"

func TestHeaderBoundRecordsBindingOnce(t *testing.T) {
	varDoc := Parse("r.md", roman)
	got := LiveExamples(varDoc, Plan(varDoc, romanReg(true)))
	want := []BaselineExample{{Name: "Each row gives a decimal and a roman number:", Line: 1}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestHeaderBoundBindingThatStopsMatchingDrifts(t *testing.T) {
	varDoc := Parse("r.md", roman)
	baseline := DeriveSpecBaseline(roman, varDoc, Plan(varDoc, romanReg(true)))
	got := bare(DetectDrift(&baseline, varDoc, Plan(varDoc, romanReg(false))))
	if !reflect.DeepEqual(got, []string{"Each row gives a decimal and a roman number:@1"}) {
		t.Errorf("got %v", got)
	}
}

func TestReconcileRecordsThenReportsAndPreservesOnDrift(t *testing.T) {
	source := "I withdraw 40."
	varDoc := Parse("w.md", source)
	store := &memoryStore{}
	if d := ReconcileDrift(store, "w.md", source, varDoc, planOf(source, reg(true)), false); len(d) != 0 {
		t.Fatalf("expected clean first run, got %v", bare(d))
	}
	beforeLock := *store.contents
	drifts := ReconcileDrift(store, "w.md", source, varDoc, planOf(source, reg(false)), false)
	if !reflect.DeepEqual(bare(drifts), []string{"I withdraw 40@1"}) {
		t.Errorf("got %v", bare(drifts))
	}
	if *store.contents != beforeLock {
		t.Errorf("lock should be preserved while unacknowledged")
	}
}

func TestReconcileUpdateModeAcceptsDrift(t *testing.T) {
	source := "I withdraw 40."
	varDoc := Parse("w.md", source)
	store := &memoryStore{}
	ReconcileDrift(store, "w.md", source, varDoc, planOf(source, reg(true)), false)
	if d := ReconcileDrift(store, "w.md", source, varDoc, planOf(source, reg(false)), true); len(d) != 0 {
		t.Errorf("update mode should accept drift, got %v", bare(d))
	}
	lock := ParseVarLock(*store.contents)
	if lock == nil || len(lock.Specs["w.md"].Examples) != 0 {
		t.Errorf("expected empty examples after update-mode reconcile")
	}
}

const expectedLock = "{\n  \"version\": 1,\n  \"specs\": {\n    \"library.md\": {\n      \"sourceHash\": \"fnv1a:1a2b3c4d\",\n      \"examples\": [\n        {\n          \"name\": \"I check out\",\n          \"line\": 7\n        }\n      ]\n    }\n  }\n}\n"

func TestStringifyMatchesSerializerByteForByte(t *testing.T) {
	if got := StringifyVarLock(libraryLock()); got != expectedLock {
		t.Errorf("got:\n%s\nwant:\n%s", got, expectedLock)
	}
}

func TestParseRoundTripsValidLock(t *testing.T) {
	parsed := ParseVarLock(StringifyVarLock(libraryLock()))
	if parsed == nil {
		t.Fatal("nil parse")
	}
	spec := parsed.Specs["library.md"]
	if spec.SourceHash != "fnv1a:1a2b3c4d" {
		t.Errorf("hash %q", spec.SourceHash)
	}
	if !reflect.DeepEqual(spec.Examples, []BaselineExample{{Name: "I check out", Line: 7}}) {
		t.Errorf("examples %v", spec.Examples)
	}
}

func TestParseRejectsMalformedInput(t *testing.T) {
	bad := []string{
		"not json",
		"{}",
		`{"version":2,"specs":{}}`,
		`{"version":1,"specs":{"a.md":{"examples":[]}}}`,
	}
	for _, s := range bad {
		if ParseVarLock(s) != nil {
			t.Errorf("expected nil for %q", s)
		}
	}
}

func TestDriftMessageNamesTheParagraph(t *testing.T) {
	d := Drifted{Name: "I withdraw 40", Line: 1, Span: spanFromOffsets("I withdraw 40.", 0, 13)}
	msg := DriftMessage(d)
	if !strings.Contains(msg, "I withdraw 40") {
		t.Errorf("message missing name: %q", msg)
	}
	if strings.TrimSpace(msg) == "" {
		t.Errorf("empty message")
	}
}
