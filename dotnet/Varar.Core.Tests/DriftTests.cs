using System;
using System.Collections.Immutable;
using System.Linq;
using Varar.Core;
using Xunit;

namespace Varar.Core.Tests;

// Translated from drift.test.ts (the unit gate for the drift feature).
public class DriftTests
{
    private sealed class MemoryStore : IBaselineStore
    {
        public string? Contents;

        public MemoryStore(string? initial = null) => Contents = initial;

        public string? Read() => Contents;

        public void Write(string contents) => Contents = contents;
    }

    private static Registry Reg(bool withStep = true)
    {
        var r = Registry.Create();
        if (withStep)
        {
            r = Registry.AddStep(r, new StepInput("I withdraw {int}", "steps.cs", 1, (_, _) => null, StepKind.Stimulus));
        }

        return r;
    }

    private static Registry RomanReg(bool withStep = true)
    {
        var r = Registry.Create();
        if (withStep)
        {
            r = Registry.AddStep(r, new StepInput("a decimal and a roman number", "steps.cs", 1, (_, _) => null, StepKind.Sensor));
        }

        return r;
    }

    private static (string Name, int Line)[] Bare(ImmutableArray<Drift> drifts) =>
        drifts.Select(d => (d.Name, d.Line)).ToArray();

    private static ImmutableArray<Drift> DetectFor(string source, Registry baselineReg, Registry currentReg)
    {
        var doc = Parse.Run("w.md", source);
        var baseline = DriftDetection.DeriveSpecBaseline(source, doc, Plan.Run(doc, baselineReg));
        return DriftDetection.DetectDrift(baseline, doc, Plan.Run(doc, currentReg));
    }

    [Fact]
    public void LiveExamplesRecordsOneEntryPerExampleProducingParagraph()
    {
        var doc = Parse.Run("w.md", "I withdraw 40.");
        var examples = DriftDetection.LiveExamples(doc, Plan.Run(doc, Reg()));
        Assert.Equal(new[] { new BaselineExample("I withdraw 40", 1) }, examples);
    }

    [Fact]
    public void ANeverMatchedParagraphIsNotRecorded()
    {
        var doc = Parse.Run("w.md", "Just some prose.");
        Assert.Empty(DriftDetection.LiveExamples(doc, Plan.Run(doc, Reg())));
    }

    [Fact]
    public void DeriveSpecBaselineCarriesTheSourceFingerprint()
    {
        const string source = "I withdraw 40.";
        var doc = Parse.Run("w.md", source);
        var baseline = DriftDetection.DeriveSpecBaseline(source, doc, Plan.Run(doc, Reg()));
        Assert.Equal(Hash.HashSource(source), baseline.SourceHash);
        Assert.Equal(new[] { new BaselineExample("I withdraw 40", 1) }, baseline.Examples);
    }

    [Fact]
    public void NoBaselineMeansNoDrift()
    {
        var doc = Parse.Run("w.md", "I withdraw 40.");
        Assert.Empty(DriftDetection.DetectDrift(null, doc, Plan.Run(doc, Reg())));
    }

    [Fact]
    public void AnUnchangedSpecHasNoDrift() =>
        Assert.Empty(DetectFor("I withdraw 40.", Reg(), Reg()));

    [Fact]
    public void ARenamedStepDefinitionDrifts() =>
        Assert.Equal(new[] { ("I withdraw 40", 1) }, Bare(DetectFor("I withdraw 40.", Reg(true), Reg(false))));

    [Fact]
    public void AnInPlaceTypoDrifts()
    {
        var beforeDoc = Parse.Run("w.md", "I withdraw 40.");
        var baseline = DriftDetection.DeriveSpecBaseline("I withdraw 40.", beforeDoc, Plan.Run(beforeDoc, Reg()));
        var afterDoc = Parse.Run("w.md", "I withdrraw 40.");
        var drift = DriftDetection.DetectDrift(baseline, afterDoc, Plan.Run(afterDoc, Reg()));
        Assert.Equal(new[] { ("I withdraw 40", 1) }, Bare(drift));
    }

    [Fact]
    public void ADeletedParagraphIsNotDrift()
    {
        var beforeDoc = Parse.Run("w.md", "I withdraw 40.");
        var baseline = DriftDetection.DeriveSpecBaseline("I withdraw 40.", beforeDoc, Plan.Run(beforeDoc, Reg()));
        var afterDoc = Parse.Run("w.md", string.Empty);
        Assert.Empty(DriftDetection.DetectDrift(baseline, afterDoc, Plan.Run(afterDoc, Reg())));
    }

    [Fact]
    public void ANewProseParagraphIsNotDrift()
    {
        var beforeDoc = Parse.Run("w.md", "I withdraw 40.");
        var baseline = DriftDetection.DeriveSpecBaseline("I withdraw 40.", beforeDoc, Plan.Run(beforeDoc, Reg()));
        var afterDoc = Parse.Run("w.md", "I withdraw 40.\n\nSome new narration.");
        Assert.Empty(DriftDetection.DetectDrift(baseline, afterDoc, Plan.Run(afterDoc, Reg())));
    }

    [Fact]
    public void MovingAnExampleNeverDrifts()
    {
        var beforeDoc = Parse.Run("w.md", "I withdraw 40.\n\nI withdraw 10.");
        var baseline = DriftDetection.DeriveSpecBaseline("I withdraw 40.\n\nI withdraw 10.", beforeDoc, Plan.Run(beforeDoc, Reg()));
        var afterDoc = Parse.Run("w.md", "I withdraw 10.\n\nI withdraw 40.");
        Assert.Empty(DriftDetection.DetectDrift(baseline, afterDoc, Plan.Run(afterDoc, Reg())));
    }

    [Fact]
    public void MovingAndRewordingAStillMatchingExampleDoesNotDrift()
    {
        var beforeDoc = Parse.Run("w.md", "I withdraw 40.\n\nI withdraw 10.");
        var baseline = DriftDetection.DeriveSpecBaseline("I withdraw 40.\n\nI withdraw 10.", beforeDoc, Plan.Run(beforeDoc, Reg()));
        var afterDoc = Parse.Run("w.md", "I withdraw 11.\n\nI withdraw 40.");
        Assert.Empty(DriftDetection.DetectDrift(baseline, afterDoc, Plan.Run(afterDoc, Reg())));
    }

    [Fact]
    public void MoveRewordAndProseOnOldLineDoesNotFalsePositive()
    {
        var beforeDoc = Parse.Run("w.md", "I withdraw 40.");
        var baseline = DriftDetection.DeriveSpecBaseline("I withdraw 40.", beforeDoc, Plan.Run(beforeDoc, Reg()));
        var afterDoc = Parse.Run("w.md", "Just some notes.\n\nI withdraw 41.");
        Assert.Empty(DriftDetection.DetectDrift(baseline, afterDoc, Plan.Run(afterDoc, Reg())));
    }

    [Fact]
    public void AParagraphRewrittenPastRecognitionIsNotDrift()
    {
        var beforeDoc = Parse.Run("w.md", "I withdraw 40.");
        var baseline = DriftDetection.DeriveSpecBaseline("I withdraw 40.", beforeDoc, Plan.Run(beforeDoc, Reg()));
        var afterDoc = Parse.Run("w.md", "The branch closed years ago.");
        Assert.Empty(DriftDetection.DetectDrift(baseline, afterDoc, Plan.Run(afterDoc, Reg())));
    }

    [Fact]
    public void AHeaderBoundTableRecordsItsBindingParagraphOnce()
    {
        const string source = "Each row gives a decimal and a roman number:\n\n| decimal | roman |\n| ------: | :---- |\n| 3 | III |\n| 9 | IX |\n";
        var doc = Parse.Run("r.md", source);
        var examples = DriftDetection.LiveExamples(doc, Plan.Run(doc, RomanReg()));
        Assert.Equal(new[] { new BaselineExample("Each row gives a decimal and a roman number:", 1) }, examples);
    }

    [Fact]
    public void AHeaderBoundBindingParagraphThatStopsMatchingDrifts()
    {
        const string source = "Each row gives a decimal and a roman number:\n\n| decimal | roman |\n| ------: | :---- |\n| 3 | III |\n| 9 | IX |\n";
        var doc = Parse.Run("r.md", source);
        var baseline = DriftDetection.DeriveSpecBaseline(source, doc, Plan.Run(doc, RomanReg(true)));
        var drift = DriftDetection.DetectDrift(baseline, doc, Plan.Run(doc, RomanReg(false)));
        Assert.Equal(new[] { ("Each row gives a decimal and a roman number:", 1) }, Bare(drift));
    }

    [Fact]
    public void ADriftCarriesTheDriftedParagraphSpan()
    {
        const string source = "Some prose first.\n\nI withdraw 40.";
        var doc = Parse.Run("w.md", source);
        var baseline = DriftDetection.DeriveSpecBaseline(source, doc, Plan.Run(doc, Reg(true)));
        var drift = DriftDetection.DetectDrift(baseline, doc, Plan.Run(doc, Reg(false)))[0];
        Assert.Equal(3, drift.Line);
        Assert.Equal(3, drift.Span.StartLine);
        Assert.Equal("I withdraw 40.", source.Substring(drift.Span.StartOffset, drift.Span.EndOffset - drift.Span.StartOffset));
    }

    [Fact]
    public void DriftDiagnosticsProjectsOntoErrorSeverity()
    {
        var drifts = DetectFor("I withdraw 40.", Reg(true), Reg(false));
        var diags = DriftDetection.DriftDiagnostics(drifts);
        var diag = Assert.Single(diags);
        Assert.Equal(Severity.Error, diag.Severity);
        Assert.Equal(DiagnosticCode.Drift, diag.Code);
        Assert.Contains("I withdraw 40", diag.Message);
        Assert.Equal(1, diag.Span.StartLine);
    }

    [Fact]
    public void ReconcileDriftRecordsABaselineOnFirstRunAndReportsNoDrift()
    {
        const string source = "I withdraw 40.";
        var doc = Parse.Run("w.md", source);
        var store = new MemoryStore();
        var drifts = DriftDetection.ReconcileDrift(store, "w.md", source, doc, Plan.Run(doc, Reg()));
        Assert.Empty(drifts);
        var lockFile = DriftDetection.ParseVarLock(store.Contents ?? string.Empty);
        Assert.Equal(new[] { new BaselineExample("I withdraw 40", 1) }, lockFile!.Specs["w.md"].Examples);
    }

    [Fact]
    public void ReconcileDriftReportsDriftAndPreservesTheBaseline()
    {
        const string source = "I withdraw 40.";
        var doc = Parse.Run("w.md", source);
        var store = new MemoryStore();
        DriftDetection.ReconcileDrift(store, "w.md", source, doc, Plan.Run(doc, Reg(true)));
        var before = store.Contents;
        var drifts = DriftDetection.ReconcileDrift(store, "w.md", source, doc, Plan.Run(doc, Reg(false)));
        Assert.Equal(new[] { ("I withdraw 40", 1) }, Bare(drifts));
        Assert.Equal(before, store.Contents); // baseline untouched while drift is unacknowledged
    }

    [Fact]
    public void ReconcileDriftInUpdateModeAcceptsDriftAndReRecords()
    {
        const string source = "I withdraw 40.";
        var doc = Parse.Run("w.md", source);
        var store = new MemoryStore();
        DriftDetection.ReconcileDrift(store, "w.md", source, doc, Plan.Run(doc, Reg(true)));
        var drifts = DriftDetection.ReconcileDrift(store, "w.md", source, doc, Plan.Run(doc, Reg(false)), update: true);
        Assert.Empty(drifts);
        Assert.Empty(DriftDetection.ParseVarLock(store.Contents ?? string.Empty)!.Specs["w.md"].Examples);
    }

    [Fact]
    public void ParseVarLockRoundTripsAValidLock()
    {
        var lockFile = new VarLock(1, ImmutableDictionary<string, SpecBaseline>.Empty
            .SetItem("library.md", new SpecBaseline("fnv1a:1a2b3c4d", ImmutableArray.Create(new BaselineExample("I check out", 7)))));
        var parsed = DriftDetection.ParseVarLock(DriftDetection.StringifyVarLock(lockFile));
        Assert.NotNull(parsed);
        Assert.Equal(DriftDetection.StringifyVarLock(lockFile), DriftDetection.StringifyVarLock(parsed!));
    }

    [Fact]
    public void StringifyVarLockSortsSpecPaths()
    {
        var lockFile = new VarLock(1, ImmutableDictionary<string, SpecBaseline>.Empty
            .SetItem("zebra.md", new SpecBaseline("fnv1a:00000001", ImmutableArray<BaselineExample>.Empty))
            .SetItem("alpha.md", new SpecBaseline("fnv1a:00000002", ImmutableArray<BaselineExample>.Empty)));
        var text = DriftDetection.StringifyVarLock(lockFile);
        Assert.True(text.IndexOf("alpha.md", StringComparison.Ordinal) < text.IndexOf("zebra.md", StringComparison.Ordinal));
        Assert.EndsWith("}\n", text);
    }

    [Fact]
    public void ParseVarLockRejectsMalformedInput()
    {
        Assert.Null(DriftDetection.ParseVarLock("not json"));
        Assert.Null(DriftDetection.ParseVarLock("{}"));
        Assert.Null(DriftDetection.ParseVarLock("{\"version\":2,\"specs\":{}}"));
        Assert.Null(DriftDetection.ParseVarLock("{\"version\":1,\"specs\":{\"a.md\":{\"examples\":[]}}}"));
    }
}
