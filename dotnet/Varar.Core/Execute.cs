using System.Collections.Immutable;

namespace Varar.Core;

/// <summary>Thrown when an <c>error</c>-fenced example was expected to fail but passed.</summary>
public sealed class UnexpectedPassError : Exception
{
    public UnexpectedPassError()
        : base("expected the example to fail, but it passed")
    {
    }
}

/// <summary>One executed step's outcome (1-based ordinal), for the conformance trace.</summary>
public sealed record StepObservation(int Ordinal, string Outcome, Exception? Error);

/// <summary>
/// The executor on the full-replacement state model. Port of <c>execute.ts</c> / the Rust
/// <c>execute.rs</c>: a stimulus returns the whole next state; a sensor's return is compared against
/// its slots (inline params, then a trailing table/doc string); a handler fails by throwing.
/// </summary>
public static class Execute
{
    /// <summary>
    /// Runs one example, recording a per-step observation. Returns the example-level failure
    /// (null = pass), applying error-fence inversion.
    /// </summary>
    public static Exception? RunExample(
        ExecutionPlan plan,
        PlannedExample ex,
        Func<string, Value> createContext,
        List<StepObservation> observations)
    {
        var source = plan.VarDoc.Source;
        var steps = ex.Steps;
        var stateByFile = new Dictionary<string, Value>(StringComparer.Ordinal);
        Value? lastReturn = null;
        Exception? thrown = null;

        for (int i = 0; i < steps.Length; i++)
        {
            var step = steps[i];
            var file = step.StepDef.ExpressionSourceFile;
            if (!stateByFile.TryGetValue(file, out var state))
            {
                state = createContext(file);
                stateByFile[file] = state;
            }

            var callArgs = new List<Value>(step.Args);
            if (step.DataTable is not null)
            {
                callArgs.Add(TableRows(step.DataTable));
            }
            else if (step.DocString is not null)
            {
                callArgs.Add(Value.Of(step.DocString.Content));
            }

            try
            {
                var returned = step.StepDef.Handler(state, callArgs) as Value;
                lastReturn = returned;
                switch (step.StepDef.Kind)
                {
                    case StepKind.Stimulus:
                        // Full replacement: the return IS the next state. Returning
                        // nothing (null) leaves state unchanged — it does not wipe it.
                        if (returned is not null)
                        {
                            stateByFile[file] = returned;
                        }

                        break;
                    case StepKind.Sensor:
                        if (ex.RowChecks.IsDefaultOrEmpty)
                        {
                            CheckSensorReturn(source, step, returned);
                        }

                        break;
                    default:
                        throw new ReturnShapeError("unknown step kind: null");
                }

                observations.Add(new StepObservation(i + 1, "pass", null));
            }
            catch (Exception err)
            {
                observations.Add(new StepObservation(i + 1, "fail", err));
                thrown = err;
                break;
            }
        }

        // Header-bound row checks (deferred to after the loop).
        if (thrown is null && !ex.RowChecks.IsDefaultOrEmpty)
        {
            var bad = CellDiffs.CompareRow(lastReturn, ex.RowChecks).Where(d => !d.Ok).ToImmutableArray();
            // Like a slotted sensor, a header-bound row step must answer the row it is bound to:
            // no return means nothing was compared.
            Exception? rowError = lastReturn is null
                ? new ReturnShapeError("a header-bound row step must return a row object with one value per bound cell, got nothing")
                : null;
            if (rowError is not null || bad.Length > 0)
            {
                var err = rowError ?? new CellMismatchError(bad);
                observations.Add(new StepObservation(steps.Length, "fail", err));
                thrown = err;
            }
        }

        // Error-fence inversion.
        if (ex.ExpectedFail)
        {
            if (thrown is null)
            {
                return new UnexpectedPassError();
            }

            if (ex.ExpectedErrorMessage is not null &&
                !thrown.Message.Contains(ex.ExpectedErrorMessage, StringComparison.Ordinal))
            {
                return thrown;
            }

            return null;
        }

        return thrown;
    }

    private static void CheckSensorReturn(string source, PlannedStep step, Value? returned)
    {
        int extraCount = step.DataTable is not null || step.DocString is not null ? 1 : 0;
        int slotCount = step.Args.Length + extraCount;
        if (slotCount == 0)
        {
            // Nothing to compare against: returning nothing is the pass, a value is a mistake.
            if (returned is null)
            {
                return;
            }

            throw new ReturnShapeError(
                "this sensor has no parameters, data table or doc string — nothing to compare a return value against " +
                "(throw to fail, return nothing to pass)");
        }

        // With one or more slots the return is REQUIRED: returning nothing used to skip the
        // comparison silently, so a typo in a property access turned an assertion into a no-op.
        if (returned is null)
        {
            throw new ReturnShapeError(
                $"a sensor with {slotCount} slot(s) must return one value per slot, got nothing");
        }

        ImmutableArray<Value> slots;
        if (slotCount == 1)
        {
            slots = ImmutableArray.Create(returned);
        }
        else if (returned is VList list)
        {
            if (list.Items.Length != slotCount)
            {
                throw new ReturnShapeError($"sensor return must have {slotCount} element(s), got {list.Items.Length}");
            }

            slots = list.Items;
        }
        else
        {
            throw new ReturnShapeError(
                $"a sensor with {slotCount} slots must return a List of {slotCount} values, got {returned.TypeName}");
        }

        int argCount = step.Args.Length;
        if (argCount > 0)
        {
            var sourceTexts = step.ParamSpans.Select(s => Scanner.Slice(source, s.StartOffset, s.EndOffset)).ToArray();
            var bad = ParamDiff.CompareParams(slots.Take(argCount).ToList(), step.Args, step.ParamSpans, sourceTexts, step.Formats)
                .Where(d => !d.Ok)
                .ToImmutableArray();
            if (bad.Length > 0)
            {
                throw new CellMismatchError(bad);
            }
        }

        if (step.DataTable is not null)
        {
            var bad = CellDiffs.CompareTable(slots[argCount], step.DataTable).Where(d => !d.Ok).ToImmutableArray();
            if (bad.Length > 0)
            {
                throw new CellMismatchError(bad);
            }
        }
        else if (step.DocString is not null)
        {
            var diff = DocStringDiffs.CompareDocString(slots[argCount], step.DocString.Content, step.DocString.Span);
            if (diff is not null)
            {
                throw new CellMismatchError([diff]);
            }
        }
    }

    // A trailing data table is passed as [header cells, ...row cells] of strings.
    private static Value TableRows(Table table)
    {
        Value Row(ImmutableArray<string> cells) => Value.List(cells.Select(Value.Of));
        var rows = new List<Value> { Row(table.Header.Cells) };
        rows.AddRange(table.Rows.Select(r => Row(r.Cells)));
        return Value.List(rows);
    }
}
