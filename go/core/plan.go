package core

import (
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

// The planner — port of plan.ts / plan.rs. Plans each text-bearing block via the
// matcher, lifts block offsets to source spans, attaches trailing table/fence
// nodes, handles the ```error``` fence, expands header-bound tables into one
// example per row, and collects diagnostics.

// ExecutionPlan is the result of planning a whole VarDoc.
type ExecutionPlan struct {
	VarDoc      VarDoc
	Examples    []PlannedExample
	Diagnostics []Diagnostic
}

// PlannedExample is one matched-and-runnable example.
type PlannedExample struct {
	Name                 string
	ScopeStack           []string
	Span                 Span
	Steps                []PlannedStep
	HeaderBinding        *HeaderBinding
	RowChecks            []RowCheck // nil = not a row-bound example
	ExpectedOutcome      *string
	ExpectedErrorMessage *string
}

// HeaderBinding is the binding paragraph shared by every row of a header-bound table.
type HeaderBinding struct {
	MatchSpan  Span
	ParamSpans []Span
	StepDef    *StepRegistration
}

// PlannedStep is one matched step: text, source span, captured-parameter spans,
// args, and attachments. Formats aligns 1:1 with Args.
type PlannedStep struct {
	Text       string
	MatchSpan  Span
	ParamSpans []Span
	StepDef    *StepRegistration
	Args       []Value
	Formats    []FormatFn
	DataTable  *Table
	DocString  *Fence
}

var (
	whitespaceRE = regexp.MustCompile(`\s+`)
)

// Plan plans doc against registry. Port of plan().
//
// Two phases (ADR 0012). Phase 1 plans each candidate paragraph independently
// into a "unit" (ambiguity / error-fence diagnostics, header-bound rows,
// attachments, final steps). Phase 2 groups adjacent candidates into examples: a
// matching candidate with precededByDelimiter false merges into the open
// example; a matching candidate after a delimiter (or the first) starts a new
// one; a non-matching candidate (prose) is a delimiter that closes the open
// example and is dropped; a header-bound candidate stays standalone.
func Plan(doc VarDoc, registry Registry) ExecutionPlan {
	source := doc.Source
	diagnostics := []Diagnostic{}

	// Phase 1: plan each candidate paragraph independently.
	units := make([]candidateUnit, len(doc.Examples))
	for i, ex := range doc.Examples {
		units[i] = planCandidate(ex, doc, registry, &diagnostics)
	}

	// Phase 2: group adjacent candidates into examples.
	var examples []PlannedExample
	var open *mergedExample
	flush := func() {
		if open != nil {
			examples = append(examples, finishMerged(open, source))
			open = nil
		}
	}
	for _, unit := range units {
		if unit.headerBound {
			flush()
			examples = append(examples, unit.rows...)
			continue
		}
		if !unit.matched {
			// Prose paragraph — a delimiter. Drop it and end the open example.
			flush()
			continue
		}
		if open != nil && !unit.precededByDelimiter {
			mergeInto(open, unit)
		} else {
			flush()
			open = startMerged(unit)
		}
	}
	flush()

	// A table or fence that doesn't attach to a step is just Markdown content,
	// not a mistake — it produces no diagnostic.

	return ExecutionPlan{
		VarDoc:      doc,
		Examples:    examples,
		Diagnostics: diagnostics,
	}
}

// mergedExample is a step-bearing candidate accumulating into one example while
// adjacent matching candidates keep merging in.
type mergedExample struct {
	name                 string
	scopeStack           []string
	startOffset          int
	endOffset            int
	steps                []PlannedStep
	expectedOutcome      *string
	expectedErrorMessage *string
}

// candidateUnit is one candidate paragraph, planned in isolation. When
// headerBound is true it carries standalone per-row examples in rows; otherwise
// it is a steps unit described by the remaining fields.
type candidateUnit struct {
	headerBound bool
	rows        []PlannedExample

	matched              bool
	precededByDelimiter  bool
	name                 string
	scopeStack           []string
	span                 Span
	steps                []PlannedStep
	expectedOutcome      *string
	expectedErrorMessage *string
}

func startMerged(unit candidateUnit) *mergedExample {
	m := &mergedExample{
		name:        unit.name,
		scopeStack:  unit.scopeStack,
		startOffset: unit.span.StartOffset,
		endOffset:   unit.span.EndOffset,
		steps:       append([]PlannedStep{}, unit.steps...),
	}
	if unit.expectedOutcome != nil {
		v := *unit.expectedOutcome
		m.expectedOutcome = &v
	}
	if unit.expectedErrorMessage != nil {
		v := *unit.expectedErrorMessage
		m.expectedErrorMessage = &v
	}
	return m
}

func mergeInto(open *mergedExample, unit candidateUnit) {
	open.endOffset = unit.span.EndOffset
	open.steps = append(open.steps, unit.steps...)
	// Any error fence in a merged part marks the whole example expected-to-fail;
	// keep the first message we see.
	if unit.expectedOutcome != nil && *unit.expectedOutcome == "fail" {
		fail := "fail"
		open.expectedOutcome = &fail
		if open.expectedErrorMessage == nil && unit.expectedErrorMessage != nil {
			v := *unit.expectedErrorMessage
			open.expectedErrorMessage = &v
		}
	}
}

func finishMerged(open *mergedExample, source string) PlannedExample {
	return PlannedExample{
		Name:                 open.name,
		ScopeStack:           open.scopeStack,
		Span:                 spanFromOffsets(source, open.startOffset, open.endOffset),
		Steps:                open.steps,
		ExpectedOutcome:      open.expectedOutcome,
		ExpectedErrorMessage: open.expectedErrorMessage,
	}
}

// planCandidate plans a single candidate paragraph (plus its attached
// tables/fences) in isolation, appending any ambiguity / error-fence diagnostics.
func planCandidate(ex Example, doc VarDoc, registry Registry, diagnostics *[]Diagnostic) candidateUnit {
	source := doc.Source
	hadAmbiguous := false
	body := ex.Body

	// Pass 1: plan each text-bearing block, collecting steps per body index.
	stepsByBlock := map[int][]PlannedStep{}
	for idx, block := range body {
		if !isTextBearing(block) {
			continue
		}
		text := textOf(block)
		blockHits, ambiguities := planBlock(text, registry)
		for _, collision := range ambiguities {
			span := liftSpan(source, block, collision.matchStart, collision.matchEnd)
			*diagnostics = append(*diagnostics, ambiguousMatch(span))
			hadAmbiguous = true
		}
		if !hadAmbiguous && len(blockHits) > 0 {
			blockSteps := make([]PlannedStep, 0, len(blockHits))
			for _, h := range blockHits {
				paramSpans := make([]Span, len(h.paramSpans))
				for i, p := range h.paramSpans {
					paramSpans[i] = liftSpan(source, block, p.start, p.end)
				}
				blockSteps = append(blockSteps, PlannedStep{
					Text:       utf16Slice(text, h.matchStart, h.matchEnd),
					MatchSpan:  liftSpan(source, block, h.matchStart, h.matchEnd),
					ParamSpans: paramSpans,
					StepDef:    h.stepDef,
					Args:       h.args,
					Formats:    h.formats,
				})
			}
			stepsByBlock[idx] = blockSteps
		}
	}

	// Header-bound table: iterate row by row.
	var bound *headerBoundResult
	if !hadAmbiguous {
		bound = detectHeaderBound(body, stepsByBlock, source)
	}
	if bound != nil {
		headerCells := bound.table.Header.Cells
		var rows []PlannedExample
		for _, row := range bound.table.Rows {
			rowObject := map[string]Value{}
			for i, header := range headerCells {
				rowObject[header] = StrValue(cellAt(row, i))
			}
			rowArgs := append(append([]Value{}, bound.step.Args...), MapValue(rowObject))
			rowStep := PlannedStep{
				Text:       bound.step.Text,
				MatchSpan:  row.Span,
				ParamSpans: bound.step.ParamSpans,
				StepDef:    bound.step.StepDef,
				Args:       rowArgs,
				Formats:    bound.step.Formats,
			}
			rowChecks := make([]RowCheck, len(headerCells))
			for i, header := range headerCells {
				rowChecks[i] = NewRowCheck(header, cellAt(row, i), cellSpanAt(row, i))
			}
			nestedScope := append(append([]string{}, ex.ScopeStack...), bound.step.Text)
			rows = append(rows, PlannedExample{
				Name:       strings.Join(row.Cells, " / "),
				ScopeStack: nestedScope,
				Span:       row.Span,
				Steps:      []PlannedStep{rowStep},
				HeaderBinding: &HeaderBinding{
					MatchSpan:  bound.step.MatchSpan,
					ParamSpans: bound.headerSpans,
					StepDef:    bound.step.StepDef,
				},
				RowChecks: rowChecks,
			})
		}
		return candidateUnit{headerBound: true, rows: rows}
	}

	// An ```error fence anywhere marks the candidate expected-to-fail.
	var errorFence *Fence
	for i := range body {
		if f, ok := body[i].(Fence); ok && f.Info == "error" {
			fc := f
			errorFence = &fc
			break
		}
	}

	// Pass 2: table/fence immediately after a step-bearing block.
	type attachment struct {
		table *Table
		fence *Fence
	}
	attachments := map[int]*attachment{}
	for idx := 1; idx < len(body); idx++ {
		switch here := body[idx].(type) {
		case Table:
			if _, ok := stepsByBlock[idx-1]; ok {
				if attachments[idx-1] == nil {
					attachments[idx-1] = &attachment{}
				}
				tc := here
				attachments[idx-1].table = &tc
			}
		case Fence:
			if here.Info != "error" {
				if _, ok := stepsByBlock[idx-1]; ok {
					if attachments[idx-1] == nil {
						attachments[idx-1] = &attachment{}
					}
					fc := here
					attachments[idx-1].fence = &fc
				}
			}
		}
	}

	// Pass 3: rebuild the final step list, applying attachments to the last
	// step of each block.
	var finalSteps []PlannedStep
	for idx := 0; idx < len(body); idx++ {
		stepsAtIdx, ok := stepsByBlock[idx]
		if !ok {
			continue
		}
		attach := attachments[idx]
		last := len(stepsAtIdx) - 1
		for s, step := range stepsAtIdx {
			if s == last && attach != nil {
				withAttach := step
				withAttach.DataTable = attach.table
				withAttach.DocString = attach.fence
				finalSteps = append(finalSteps, withAttach)
				continue
			}
			finalSteps = append(finalSteps, step)
		}
	}

	var runnableSteps []PlannedStep
	if !hadAmbiguous {
		runnableSteps = finalSteps
	}

	// An `error` fence declares the candidate expected-to-fail, but here there's
	// no runnable step to produce that failure (nothing matched, or the match was
	// ambiguous). That's an author mistake, not silent Markdown — flag it.
	if errorFence != nil && len(runnableSteps) == 0 {
		*diagnostics = append(*diagnostics, errorFenceWithoutStep(errorFence.Span))
	}

	var expectedOutcome, expectedErrorMessage *string
	if errorFence != nil {
		fail := "fail"
		expectedOutcome = &fail
		trimmed := javaTrim(errorFence.Body)
		if trimmed != "" {
			msg := trimmed
			expectedErrorMessage = &msg
		}
	}

	return candidateUnit{
		matched:              len(runnableSteps) > 0,
		precededByDelimiter:  ex.PrecededByDelimiter,
		name:                 deriveExampleName(body),
		scopeStack:           ex.ScopeStack,
		span:                 ex.Span,
		steps:                runnableSteps,
		expectedOutcome:      expectedOutcome,
		expectedErrorMessage: expectedErrorMessage,
	}
}

type ambiguity struct {
	matchStart int
	matchEnd   int
}

func planBlock(text string, registry Registry) ([]hit, []ambiguity) {
	var allSteps []hit
	var allAmbiguities []ambiguity
	for _, sen := range splitSentences(text) {
		off := sen.startOffset
		raw := findHits(sen.text, registry)
		adjusted := make([]hit, len(raw))
		for i, h := range raw {
			spans := make([]paramSpan, len(h.paramSpans))
			for j, p := range h.paramSpans {
				spans[j] = paramSpan{start: p.start + off, end: p.end + off}
			}
			adjusted[i] = hit{
				expression: h.expression,
				stepDef:    h.stepDef,
				matchStart: h.matchStart + off,
				matchEnd:   h.matchEnd + off,
				args:       h.args,
				paramSpans: spans,
				formats:    h.formats,
			}
		}
		resolved := resolveHits(adjusted)
		if resolved.ambiguous {
			for _, c := range resolved.collisions {
				allAmbiguities = append(allAmbiguities, ambiguity{matchStart: c.matchStart, matchEnd: c.matchEnd})
			}
		} else if len(resolved.steps) > 0 {
			allSteps = append(allSteps, resolved.steps...)
		}
	}
	return allSteps, allAmbiguities
}

type headerBoundResult struct {
	table       Table
	step        PlannedStep
	headerSpans []Span
}

func detectHeaderBound(body []Block, stepsByBlock map[int][]PlannedStep, source string) *headerBoundResult {
	for idx := 1; idx < len(body); idx++ {
		table, ok := body[idx].(Table)
		if !ok {
			continue
		}
		above := body[idx-1]
		if !isTextBearing(above) {
			continue
		}
		steps, ok := stepsByBlock[idx-1]
		if !ok || len(steps) == 0 {
			continue
		}
		aboveText := textOf(above)
		headerCells := table.Header.Cells
		offsets := make([]int, 0, len(headerCells))
		anyMissing := false
		for _, cell := range headerCells {
			o, found := wordOffset(aboveText, cell)
			if found {
				offsets = append(offsets, o)
			} else {
				anyMissing = true
				offsets = append(offsets, 0)
			}
		}
		if anyMissing {
			continue
		}
		headerSpans := make([]Span, len(headerCells))
		for i, cell := range headerCells {
			headerSpans[i] = liftSpan(source, above, offsets[i], offsets[i]+utf16Len(cell))
		}
		return &headerBoundResult{
			table:       table,
			step:        steps[len(steps)-1],
			headerSpans: headerSpans,
		}
	}
	return nil
}

// wordOffset is the UTF-16 offset of word in haystack as a whole word
// (case-sensitive), or (0, false). Manual scan replacing lookaround regex.
func wordOffset(haystack, word string) (int, bool) {
	if word == "" {
		return 0, false
	}
	from := 0
	for {
		rel := strings.Index(haystack[from:], word)
		if rel < 0 {
			return 0, false
		}
		at := from + rel
		beforeOK := true
		if at > 0 {
			r, _ := utf8.DecodeLastRuneInString(haystack[:at])
			beforeOK = !isWordChar(r)
		}
		after := at + len(word)
		afterOK := true
		if after < len(haystack) {
			r, _ := utf8.DecodeRuneInString(haystack[after:])
			afterOK = !isWordChar(r)
		}
		if beforeOK && afterOK {
			return utf16Index(haystack, at), true
		}
		_, size := utf8.DecodeRuneInString(haystack[at:])
		if size == 0 {
			size = 1
		}
		from = at + size
	}
}

func isWordChar(r rune) bool {
	return unicode.IsLetter(r) || unicode.IsNumber(r) || r == '_'
}

// deriveExampleName is the example name: the primary block's text with
// whitespace collapsed and a single trailing terminator stripped.
func deriveExampleName(body []Block) string {
	var primary Block
	for _, b := range body {
		if isTextBearing(b) {
			primary = b
			break
		}
	}
	if primary == nil {
		return ""
	}
	collapsed := whitespaceRE.ReplaceAllString(textOf(primary), " ")
	name := javaTrim(collapsed)
	if r, size := utf8.DecodeLastRuneInString(name); size > 0 {
		if r == '.' || r == '!' || r == '?' {
			name = name[:len(name)-size]
		}
	}
	return name
}

func isTextBearing(block Block) bool {
	switch block.(type) {
	case Paragraph, ListItem, Blockquote:
		return true
	}
	return false
}

func textOf(block Block) string {
	switch b := block.(type) {
	case Paragraph:
		return b.Text
	case ListItem:
		return b.Text
	case Blockquote:
		return b.Text
	}
	panic("not a text-bearing block")
}

func cellAt(row Row, i int) string {
	if i < len(row.Cells) {
		return row.Cells[i]
	}
	return ""
}

func cellSpanAt(row Row, i int) Span {
	if i < len(row.CellSpans) {
		return row.CellSpans[i]
	}
	return row.Span
}

func segmentMapOf(block Block) ([]SegmentOffset, bool) {
	switch b := block.(type) {
	case Paragraph:
		return b.SegmentMap, true
	case ListItem:
		return b.SegmentMap, true
	case Blockquote:
		return b.SegmentMap, true
	}
	return nil, false
}

func liftSpan(source string, block Block, blockStart, blockEnd int) Span {
	sm, ok := segmentMapOf(block)
	if !ok {
		return blockSpanOf(block)
	}
	start := liftSegmentOffset(sm, blockStart)
	end := liftSegmentOffset(sm, blockEnd)
	return spanFromOffsets(source, start, end)
}

func liftSegmentOffset(segmentMap []SegmentOffset, textOffset int) int {
	best := segmentMap[0]
	for _, entry := range segmentMap {
		if entry.TextOffset <= textOffset {
			best = entry
		}
	}
	return best.SourceOffset + (textOffset - best.TextOffset)
}
