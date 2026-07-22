package core

import (
	"fmt"
	"strings"
)

// The executor — port of execute.ts / execute.rs, on the full-replacement state
// model. Handlers are invoked via closures (no reflection); panics are recovered
// (the assertion-style failure channel). State is a Value, replaced wholesale by
// each stimulus.

// StepOutcome is a step's outcome in the conformance trace.
type StepOutcome int

const (
	OutcomePass StepOutcome = iota
	OutcomeFail
	OutcomeSkipped
)

// String is the wire string ("pass"/"fail"/"skipped").
func (o StepOutcome) String() string {
	switch o {
	case OutcomePass:
		return "pass"
	case OutcomeFail:
		return "fail"
	default:
		return "skipped"
	}
}

// StepObservation is one executed step's outcome. ExampleIndex is 0-based;
// Ordinal is 1-based.
type StepObservation struct {
	ExampleIndex int
	Ordinal      int
	Outcome      StepOutcome
	Error        *StepFailure
}

// ExecutePorts are the ports the executor needs. CreateContext maps a step-file
// to its fresh initial state (nil → Null per file); Observer is optional
// per-step instrumentation; Reporter receives every planning diagnostic.
type ExecutePorts struct {
	Reporter      func(Diagnostic)
	CreateContext func(file string) any
	Observer      func(StepObservation)
}

// QueuedExample is one runnable example: its name and a callback that runs its steps.
type QueuedExample struct {
	Name string
	run  func() *StepFailure
}

// Run runs the example's steps; non-nil on the first failure.
func (q QueuedExample) Run() *StepFailure { return q.run() }

// CollectExamples reports every diagnostic in plan, then returns one
// QueuedExample per planned example, in document order (each run is lazy).
func CollectExamples(plan ExecutionPlan, ports ExecutePorts) []QueuedExample {
	if ports.Reporter != nil {
		for _, d := range plan.Diagnostics {
			ports.Reporter(d)
		}
	}
	queue := make([]QueuedExample, len(plan.Examples))
	for i := range plan.Examples {
		idx := i
		ex := plan.Examples[i]
		queue[i] = QueuedExample{
			Name: ex.Name,
			run:  func() *StepFailure { return runExample(plan, ex, idx, ports) },
		}
	}
	return queue
}

// ExecutePlan runs every example in plan, in order, stopping at the first failure.
func ExecutePlan(plan ExecutionPlan, ports ExecutePorts) *StepFailure {
	for _, q := range CollectExamples(plan, ports) {
		if f := q.Run(); f != nil {
			return f
		}
	}
	return nil
}

func runExample(plan ExecutionPlan, ex PlannedExample, exampleIndex int, ports ExecutePorts) *StepFailure {
	path := plan.VarDoc.Path
	source := plan.VarDoc.Source
	steps := ex.Steps

	stateByFile := map[string]any{}
	var lastReturn *Value
	var thrown *StepFailure

	for i := range steps {
		step := steps[i]
		file := step.StepDef.ExpressionSourceFile
		state, ok := stateByFile[file]
		if !ok {
			state = createContext(ports, file)
			stateByFile[file] = state
		}

		// A trailing data table / doc string is the last handler argument.
		callArgs := append([]Value{}, step.Args...)
		if step.DataTable != nil {
			callArgs = append(callArgs, tableRows(*step.DataTable))
		} else if step.DocString != nil {
			callArgs = append(callArgs, StrValue(step.DocString.Body))
		}

		var stepError *StepError
		returned, herr := invokeResolve(step.StepDef.Handler, state, callArgs)
		if herr != nil {
			e := handlerStepError(*herr)
			stepError = &e
		} else {
			lastReturn = asValuePointer(returned)
			switch {
			case step.StepDef.Kind == nil:
				e := returnShapeError("unknown step kind: null")
				stepError = &e
			case *step.StepDef.Kind == Stimulus:
				stateByFile[file] = returned
			case *step.StepDef.Kind == Sensor:
				// Header-bound rows are checked after the loop via RowChecks.
				if ex.RowChecks == nil {
					stepError = checkSensorReturn(source, step, asValuePointer(returned))
				}
			}
		}

		if stepError == nil {
			observe(ports, StepObservation{ExampleIndex: exampleIndex, Ordinal: i + 1, Outcome: OutcomePass})
		} else {
			failure := attachLocation(*stepError, step, path)
			observe(ports, StepObservation{ExampleIndex: exampleIndex, Ordinal: i + 1, Outcome: OutcomeFail, Error: &failure})
			thrown = &failure
			break
		}
	}

	// Header-bound row checks (deferred to after the loop).
	if thrown == nil && ex.RowChecks != nil && len(ex.RowChecks) > 0 {
		var bad []CellDiff
		for _, d := range compareRow(lastReturn, ex.RowChecks) {
			if !d.Ok {
				bad = append(bad, d)
			}
		}
		// Like a slotted sensor, a header-bound row step must answer the row it is
		// bound to: no return means nothing was compared.
		if lastReturn == nil || len(bad) > 0 {
			lastStep := steps[len(steps)-1]
			err := cellMismatchError(bad)
			if lastReturn == nil {
				err = returnShapeError("a header-bound row step must return a row object with one value per bound cell, got nothing")
			}
			failure := attachLocation(err, lastStep, path)
			observe(ports, StepObservation{ExampleIndex: exampleIndex, Ordinal: len(steps), Outcome: OutcomeFail, Error: &failure})
			thrown = &failure
		}
	}

	// Error-fence inversion.
	if ex.ExpectedOutcome != nil && *ex.ExpectedOutcome == "fail" {
		if thrown == nil {
			if len(steps) > 0 {
				f := attachLocation(StepError{Kind: SEUnexpectedPass}, steps[len(steps)-1], path)
				return &f
			}
			f := bareFailure(StepError{Kind: SEUnexpectedPass})
			return &f
		}
		if ex.ExpectedErrorMessage != nil {
			if !strings.Contains(thrown.Error.Message(), *ex.ExpectedErrorMessage) {
				return thrown
			}
		}
		return nil
	}

	return thrown
}

func createContext(ports ExecutePorts, file string) any {
	if ports.CreateContext != nil {
		return ports.CreateContext(file)
	}
	return nil
}

// asValuePointer reads a handler result as a comparable Value. A stimulus's
// next state may be any Go value and is never read this way; a sensor's result
// is always a *Value (the facade boxes it), and nil means "no assertion".
func asValuePointer(result any) *Value {
	switch v := result.(type) {
	case nil:
		return nil
	case *Value:
		return v
	case Value:
		return &v
	}
	return nil
}

func observe(ports ExecutePorts, observation StepObservation) {
	if ports.Observer != nil {
		ports.Observer(observation)
	}
}

func tableRows(table Table) Value {
	row := func(cells []string) Value {
		vs := make([]Value, len(cells))
		for i, c := range cells {
			vs[i] = StrValue(c)
		}
		return ListOf(vs)
	}
	rows := []Value{row(table.Header.Cells)}
	for _, r := range table.Rows {
		rows = append(rows, row(r.Cells))
	}
	return ListOf(rows)
}

func attachLocation(error StepError, step PlannedStep, varPath string) StepFailure {
	a := anchor(error, step.MatchSpan)
	return StepFailure{
		Error: error,
		Location: &FailureLocation{
			Label: truncateLabel(step.Text),
			Path:  varPath,
			Line:  a.StartLine,
		},
	}
}

func truncateLabel(text string) string {
	if utf16Len(text) > 60 {
		runes := []rune(text)
		if len(runes) > 60 {
			runes = runes[:60]
		}
		return string(runes) + "…"
	}
	return text
}

func checkSensorReturn(source string, step PlannedStep, returned *Value) *StepError {
	extraCount := 0
	if step.DataTable != nil || step.DocString != nil {
		extraCount = 1
	}
	slotCount := len(step.Args) + extraCount
	if slotCount == 0 {
		// Nothing to compare against: returning nothing is the pass, a value is a mistake.
		if returned == nil {
			return nil
		}
		e := returnShapeError("this sensor has no parameters, data table or doc string — nothing to compare a return value against (throw to fail, return nothing to pass)")
		return &e
	}
	// With one or more slots the return is REQUIRED: returning nothing used to
	// skip the comparison silently, so a typo turned an assertion into a no-op.
	if returned == nil {
		e := returnShapeError(fmt.Sprintf("a sensor with %d slot(s) must return one value per slot, got nothing", slotCount))
		return &e
	}
	var slots []Value
	if slotCount == 1 {
		// The return IS the single slot's value, never read as a positional list.
		slots = []Value{*returned}
	} else {
		if returned.Kind != KindList {
			e := returnShapeError(fmt.Sprintf("a sensor with %d slots must return a List of %d values, got %s", slotCount, slotCount, returned.TypeName()))
			return &e
		}
		if len(returned.List) != slotCount {
			e := returnShapeError(fmt.Sprintf("sensor return must have %d element(s), got %d", slotCount, len(returned.List)))
			return &e
		}
		slots = returned.List
	}

	argCount := len(step.Args)
	if argCount > 0 {
		sourceTexts := make([]string, len(step.ParamSpans))
		for i, s := range step.ParamSpans {
			sourceTexts[i] = utf16Slice(source, s.StartOffset, s.EndOffset)
		}
		var bad []CellDiff
		for _, d := range compareParamsWithFormats(slots[0:argCount], step.Args, step.ParamSpans, sourceTexts, step.Formats) {
			if !d.Ok {
				bad = append(bad, d)
			}
		}
		if len(bad) > 0 {
			e := cellMismatchError(bad)
			return &e
		}
	}

	if step.DataTable != nil {
		diffs, err := compareTable(&slots[argCount], *step.DataTable)
		if err != nil {
			return err
		}
		var bad []CellDiff
		for _, d := range diffs {
			if !d.Ok {
				bad = append(bad, d)
			}
		}
		if len(bad) > 0 {
			e := cellMismatchError(bad)
			return &e
		}
	} else if step.DocString != nil {
		diff, err := compareDocString(&slots[argCount], step.DocString.Body, step.DocString.BodySpan)
		if err != nil {
			return err
		}
		if diff != nil {
			e := cellMismatchError([]CellDiff{*diff})
			return &e
		}
	}
	return nil
}

// invokeResolve invokes the handler, normalising a returned error — and
// recovering a panic (the assertion-style failure channel) — into a
// HandlerError. Returns (returned, nil) on success where returned is nil for
// "no value", or (nil, err) on failure.
func invokeResolve(handler Handler, state any, args []Value) (returned any, herr *HandlerError) {
	defer func() {
		if r := recover(); r != nil {
			returned = nil
			herr = handlerErrorFromPanic(r)
		}
	}()
	v, err := handler.call(state, args)
	if err != nil {
		return nil, NewHandlerError(err.Error())
	}
	return v, nil
}

func handlerErrorFromPanic(r any) *HandlerError {
	switch v := r.(type) {
	case *HandlerError:
		return v
	case error:
		return NewHandlerError(v.Error())
	case string:
		return NewHandlerError(v)
	default:
		return NewHandlerError(fmt.Sprintf("%v", r))
	}
}
