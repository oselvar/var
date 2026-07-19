package runner

import (
	"fmt"

	"github.com/varar-dev/varar-go/core"
)

// PlanSpec parses + plans one spec.
func PlanSpec(name, source string, registry core.Registry) core.ExecutionPlan {
	return core.Plan(core.Parse(name, source), registry)
}

// ExampleNames is the per-example display names: the innermost heading (or the
// body-derived name when there is no heading), de-duplicated with a [n] suffix —
// so header-bound rows share their binding sentence's name.
func ExampleNames(plan core.ExecutionPlan) []string {
	seen := map[string]int{}
	names := make([]string, len(plan.Examples))
	for i, ex := range plan.Examples {
		base := ex.Name
		if len(ex.ScopeStack) > 0 {
			base = ex.ScopeStack[len(ex.ScopeStack)-1]
		}
		idx := seen[base]
		seen[base] = idx + 1
		if idx == 0 {
			names[i] = base
		} else {
			names[i] = fmt.Sprintf("%s[%d]", base, idx)
		}
	}
	return names
}

// RunExample runs a single example by index. contextFactory maps a step file to
// its fresh initial state. Returns nil on pass, the failure on fail.
func RunExample(plan core.ExecutionPlan, contextFactory func(file string) any, index int) *core.StepFailure {
	ports := core.ExecutePorts{
		Reporter:      func(core.Diagnostic) {},
		CreateContext: contextFactory,
	}
	return core.CollectExamples(plan, ports)[index].Run()
}
