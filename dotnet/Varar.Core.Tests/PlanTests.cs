using System.Collections.Immutable;
using System.Linq;
using Varar.Core;
using Xunit;

namespace Varar.Core.Tests;

// Example-delimiter grouping (ADR 0012): mirrors the plan.test.ts additions.
public class PlanTests
{
    private static Registry Reg()
    {
        var r = Registry.Create();
        r = Registry.AddStep(r, new StepInput("I have {int} in my account", "steps.cs", 1, (_, _) => null, StepKind.Stimulus));
        r = Registry.AddStep(r, new StepInput("I withdraw {int}", "steps.cs", 2, (_, _) => null, StepKind.Stimulus));
        r = Registry.AddStep(r, new StepInput("I should have {int} left", "steps.cs", 3, (_, _) => null, StepKind.Stimulus));
        return r;
    }

    private static ExecutionPlan PlanFor(string source, Registry registry) =>
        Plan.Run(Parse.Run("m.md", source), registry);

    private static string[][] StepTexts(ExecutionPlan plan) =>
        plan.Examples.Select(e => e.Steps.Select(s => s.Text).ToArray()).ToArray();

    [Fact]
    public void ConsecutiveMatchingParagraphsWithNoDelimiterMergeIntoOneExample()
    {
        const string source = "I have 100 in my account.\n\nI withdraw 40.\n\nI should have 60 left.";
        var plan = PlanFor(source, Reg());
        Assert.Single(plan.Examples);
        Assert.Equal(
            new[] { "I have 100 in my account", "I withdraw 40", "I should have 60 left" },
            plan.Examples[0].Steps.Select(s => s.Text).ToArray());

        // The name is the first matching paragraph's text.
        Assert.Equal("I have 100 in my account", plan.Examples[0].Name);
    }

    [Fact]
    public void AThematicBreakBetweenMatchingParagraphsSplitsThemIntoTwoExamples()
    {
        const string source = "I have 100 in my account.\n\n---\n\nI withdraw 40.";
        var plan = PlanFor(source, Reg());
        Assert.Equal(2, plan.Examples.Length);
        Assert.Equal(new[] { new[] { "I have 100 in my account" }, new[] { "I withdraw 40" } }, StepTexts(plan));
    }

    [Fact]
    public void AHeadingBetweenMatchingParagraphsSplitsThemIntoTwoExamples()
    {
        const string source = "I have 100 in my account.\n\n## Next\n\nI withdraw 40.";
        var plan = PlanFor(source, Reg());
        Assert.Equal(2, plan.Examples.Length);
        Assert.Equal(new[] { "Next" }, plan.Examples[1].ScopeStack);
    }

    [Fact]
    public void AProseParagraphBetweenMatchingParagraphsSplitsTheExample()
    {
        const string source = "I have 100 in my account.\n\nJust explaining what happens next.\n\nI withdraw 40.";
        var plan = PlanFor(source, Reg());
        Assert.Equal(2, plan.Examples.Length);
        Assert.Equal(new[] { new[] { "I have 100 in my account" }, new[] { "I withdraw 40" } }, StepTexts(plan));
    }

    [Fact]
    public void LeadingAndTrailingProseDoesNotMergeIntoAnExample()
    {
        const string source = "A preamble that matches nothing.\n\nI withdraw 40.\n\nA closing remark.";
        var plan = PlanFor(source, Reg());
        Assert.Single(plan.Examples);
        Assert.Equal(new[] { "I withdraw 40" }, plan.Examples[0].Steps.Select(s => s.Text).ToArray());
    }

    [Fact]
    public void ConsecutiveListItemsMergeIntoOneExample()
    {
        // Two list items, no delimiter between them → one example, shared state.
        const string source = "# Bullets\n\n- Given I have 100 in my account\n- When I withdraw 40";
        var plan = PlanFor(source, Reg());
        Assert.Single(plan.Examples);
        Assert.Equal(
            new[] { "I have 100 in my account", "I withdraw 40" },
            plan.Examples[0].Steps.Select(s => s.Text).ToArray());
    }

    [Fact]
    public void AmbiguousMatchEmitsADiagnosticAndProducesNoRunnableExample()
    {
        var r = Registry.Create();
        r = Registry.AddStep(r, new StepInput("I have {int} cukes", "a.cs", 1, (_, _) => null, StepKind.Stimulus));
        r = Registry.AddStep(r, new StepInput("I have {float} cukes", "b.cs", 1, (_, _) => null, StepKind.Stimulus));

        var plan = PlanFor("I have 42 cukes.", r);
        Assert.Single(plan.Diagnostics);
        Assert.Equal(DiagnosticCode.AmbiguousMatch, plan.Diagnostics[0].Code);

        // An ambiguous candidate has no runnable step, so it is prose (a delimiter), not an example.
        Assert.Empty(plan.Examples);
    }

    [Fact]
    public void TwoTablesInOneExampleSurviveBlankLines()
    {
        var r = Registry.Create();
        r = Registry.AddStep(r, new StepInput("the following users have been imported", "s.cs", 1, (_, _) => null, StepKind.Stimulus));
        r = Registry.AddStep(r, new StepInput("the following assets have been imported", "s.cs", 2, (_, _) => null, StepKind.Stimulus));

        const string source = "Given the following users have been imported:\n\n" +
            "| email | name |\n| ----- | ---- |\n| a@b.c | Ada  |\n\n" +
            "And the following assets have been imported:\n\n" +
            "| name  |\n| ----- |\n| Moose |";
        var plan = PlanFor(source, r);
        Assert.Single(plan.Examples);
        var ex = plan.Examples[0];
        Assert.Equal(2, ex.Steps.Length);
        Assert.Single(ex.Steps[0].DataTable!.Rows);
        Assert.Single(ex.Steps[1].DataTable!.Rows);
    }
}
