using System.Collections.Immutable;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Varar.Core;

/// <summary>One example-producing paragraph as recorded in the committed baseline.</summary>
public sealed record BaselineExample(string Name, int Line);

/// <summary>The committed baseline for one spec file.</summary>
public sealed record SpecBaseline(string SourceHash, ImmutableArray<BaselineExample> Examples);

/// <summary>The whole <c>varar.lock.json</c>: every spec keyed by its POSIX path.</summary>
public sealed record VarLock(int Version, ImmutableDictionary<string, SpecBaseline> Specs);

/// <summary>A paragraph the baseline says was an example and now matches zero steps.</summary>
public sealed record Drift(string Name, int Line, Span Span);

/// <summary>Drift detection + baseline reconciliation. Port of <c>drift.ts</c> (unit-gated, no golden).</summary>
public static class DriftDetection
{
    /// <summary>
    /// A baseline example is re-identified by text: an exact name match, else the most word-similar
    /// paragraph at or above this threshold. Ported byte-identically to every port.
    /// </summary>
    public const double DriftSimilarityThreshold = 0.5;

    /// <summary>The current example-producing paragraphs, in document order (the new baseline).</summary>
    public static ImmutableArray<BaselineExample> LiveExamples(VarDoc varDoc, ExecutionPlan plan)
    {
        var outp = ImmutableArray.CreateBuilder<BaselineExample>();
        foreach (var candidate in varDoc.Examples)
        {
            if (IsLive(candidate.Span, plan))
            {
                outp.Add(new BaselineExample(Plan.DeriveExampleName(candidate.Body), candidate.Span.StartLine));
            }
        }

        return outp.ToImmutable();
    }

    /// <summary>The full baseline record for a spec: its source fingerprint plus its live examples.</summary>
    public static SpecBaseline DeriveSpecBaseline(string source, VarDoc varDoc, ExecutionPlan plan) =>
        new(Hash.HashSource(source), LiveExamples(varDoc, plan));

    /// <summary>
    /// Detect drift for one spec: paragraphs the baseline recorded as examples that now match zero
    /// steps. Each baseline example is re-identified by the most word-similar current paragraph at or
    /// above the threshold (ties broken toward the nearest recorded line).
    /// </summary>
    public static ImmutableArray<Drift> DetectDrift(SpecBaseline? baseline, VarDoc varDoc, ExecutionPlan plan)
    {
        if (baseline is null)
        {
            return [];
        }

        var candidates = varDoc.Examples;
        var tokens = candidates.Select(c => Tokenize(Plan.DeriveExampleName(c.Body))).ToArray();
        var live = candidates.Select(c => IsLive(c.Span, plan)).ToArray();

        var drifts = ImmutableArray.CreateBuilder<Drift>();
        foreach (var b in baseline.Examples)
        {
            var bTokens = Tokenize(b.Name);
            int bestIdx = -1;
            double bestScore = 0;
            for (int i = 0; i < candidates.Length; i++)
            {
                double score = Similarity(bTokens, tokens[i]);
                if (score < DriftSimilarityThreshold)
                {
                    continue;
                }

                int line = candidates[i].Span.StartLine;
                int bestLine = bestIdx >= 0 ? candidates[bestIdx].Span.StartLine : 0;
                if (bestIdx < 0 ||
                    score > bestScore ||
                    (score == bestScore && Math.Abs(line - b.Line) < Math.Abs(bestLine - b.Line)))
                {
                    bestIdx = i;
                    bestScore = score;
                }
            }

            if (bestIdx < 0 || live[bestIdx])
            {
                continue; // unrecognizable (remove+add) or still an example — not drift
            }

            var candidate = candidates[bestIdx];
            drifts.Add(new Drift(b.Name, candidate.Span.StartLine, candidate.Span));
        }

        return drifts.ToImmutable();
    }

    /// <summary>Project drifts onto the shared Diagnostic rail.</summary>
    public static ImmutableArray<Diagnostic> DriftDiagnostics(ImmutableArray<Drift> drifts) =>
        [.. drifts.Select(d => Diagnostics.DriftDetected(d.Name, d.Span))];

    /// <summary>One spec's read → detect → write reconciliation against a <see cref="IBaselineStore"/>.</summary>
    public static ImmutableArray<Drift> ReconcileDrift(
        IBaselineStore store,
        string specPath,
        string source,
        VarDoc varDoc,
        ExecutionPlan plan,
        bool update = false)
    {
        var text = store.Read();
        var lockFile = text is not null ? ParseVarLock(text) : null;
        var baseline = lockFile is not null && lockFile.Specs.TryGetValue(specPath, out var b) ? b : null;

        var drifts = update ? [] : DetectDrift(baseline, varDoc, plan);
        if (update || drifts.Length == 0)
        {
            var nextSpec = DeriveSpecBaseline(source, varDoc, plan);
            var existing = lockFile?.Specs ?? ImmutableDictionary<string, SpecBaseline>.Empty;
            store.Write(StringifyVarLock(new VarLock(1, existing.SetItem(specPath, nextSpec))));
        }

        return drifts;
    }

    /// <summary>Parse <c>varar.lock.json</c>; null on malformed input (treated as "no baseline yet").</summary>
    public static VarLock? ParseVarLock(string text)
    {
        JsonDocument doc;
        try
        {
            doc = JsonDocument.Parse(text);
        }
        catch (JsonException)
        {
            return null;
        }

        using (doc)
        {
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            if (!root.TryGetProperty("version", out var version) ||
                version.ValueKind != JsonValueKind.Number ||
                !version.TryGetInt32(out var v) || v != 1)
            {
                return null;
            }

            if (!root.TryGetProperty("specs", out var specsEl) || specsEl.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            var specs = ImmutableDictionary.CreateBuilder<string, SpecBaseline>();
            foreach (var prop in specsEl.EnumerateObject())
            {
                var spec = ParseSpec(prop.Value);
                if (spec is null)
                {
                    return null;
                }

                specs[prop.Name] = spec;
            }

            return new VarLock(1, specs.ToImmutable());
        }
    }

    /// <summary>
    /// Serialize <c>varar.lock.json</c> deterministically: spec paths sorted, examples in document
    /// order, 2-space indent, trailing newline — <c>JSON.stringify({version,specs}, null, 2) + "\n"</c>
    /// with insertion-order keys (its own serializer, not the recursive-sort canonical JSON).
    /// </summary>
    public static string StringifyVarLock(VarLock lockFile)
    {
        var sb = new StringBuilder();
        sb.Append("{\n");
        sb.Append("  \"version\": 1,\n");

        var paths = lockFile.Specs.Keys.OrderBy(p => p, StringComparer.Ordinal).ToList();
        if (paths.Count == 0)
        {
            sb.Append("  \"specs\": {}\n");
        }
        else
        {
            sb.Append("  \"specs\": {\n");
            for (int pi = 0; pi < paths.Count; pi++)
            {
                var spec = lockFile.Specs[paths[pi]];
                sb.Append("    ").Append(JsonString(paths[pi])).Append(": {\n");
                sb.Append("      \"sourceHash\": ").Append(JsonString(spec.SourceHash)).Append(",\n");
                if (spec.Examples.Length == 0)
                {
                    sb.Append("      \"examples\": []\n");
                }
                else
                {
                    sb.Append("      \"examples\": [\n");
                    for (int ei = 0; ei < spec.Examples.Length; ei++)
                    {
                        var ex = spec.Examples[ei];
                        sb.Append("        {\n");
                        sb.Append("          \"name\": ").Append(JsonString(ex.Name)).Append(",\n");
                        sb.Append("          \"line\": ").Append(ex.Line).Append('\n');
                        sb.Append("        }").Append(ei + 1 < spec.Examples.Length ? ",\n" : "\n");
                    }

                    sb.Append("      ]\n");
                }

                sb.Append("    }").Append(pi + 1 < paths.Count ? ",\n" : "\n");
            }

            sb.Append("  }\n");
        }

        sb.Append("}\n");
        return sb.ToString();
    }

    private static SpecBaseline? ParseSpec(JsonElement element)
    {
        if (element.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        if (!element.TryGetProperty("sourceHash", out var hash) || hash.ValueKind != JsonValueKind.String)
        {
            return null;
        }

        if (!element.TryGetProperty("examples", out var examplesEl) || examplesEl.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        var examples = ImmutableArray.CreateBuilder<BaselineExample>();
        foreach (var item in examplesEl.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object ||
                !item.TryGetProperty("name", out var name) || name.ValueKind != JsonValueKind.String ||
                !item.TryGetProperty("line", out var line) || line.ValueKind != JsonValueKind.Number ||
                !line.TryGetInt32(out var lineNo))
            {
                return null;
            }

            examples.Add(new BaselineExample(name.GetString()!, lineNo));
        }

        return new SpecBaseline(hash.GetString()!, examples.ToImmutable());
    }

    // Do the two spans overlap at all (offset ranges intersect)? A candidate paragraph relates to
    // its planned example either way round: a header-bound row sits *inside* its binding paragraph,
    // while a merged example's span *covers* each of the candidates it absorbed (ADR 0012). Overlap
    // catches both.
    private static bool Overlaps(Span a, Span b) =>
        a.StartOffset < b.EndOffset && b.StartOffset < a.EndOffset;

    // A candidate is live if it overlaps at least one planned example. A now-prose paragraph — one
    // whose step def was renamed or deleted — overlaps none (it became a delimiter, splitting any
    // example it was part of), so drift catches it.
    private static bool IsLive(Span candidateSpan, ExecutionPlan plan) =>
        plan.Examples.Any(pe => Overlaps(pe.Span, candidateSpan));

    // Lower-cased Unicode letter/digit word tokens.
    private static HashSet<string> Tokenize(string text)
    {
        var set = new HashSet<string>(StringComparer.Ordinal);
        foreach (Match m in Regex.Matches(text.ToLowerInvariant(), @"[\p{L}\p{N}]+"))
        {
            set.Add(m.Value);
        }

        return set;
    }

    // Jaccard overlap |A∩B| / |A∪B|. Two empty sets count as identical.
    private static double Similarity(HashSet<string> a, HashSet<string> b)
    {
        if (a.Count == 0 && b.Count == 0)
        {
            return 1;
        }

        int intersection = a.Count(b.Contains);
        int union = a.Count + b.Count - intersection;
        return union == 0 ? 0 : (double)intersection / union;
    }

    // JS JSON.stringify string escaping (raw non-ASCII, control chars \uXXXX).
    private static string JsonString(string s)
    {
        var sb = new StringBuilder();
        sb.Append('"');
        foreach (char c in s)
        {
            switch (c)
            {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                case '\b': sb.Append("\\b"); break;
                case '\f': sb.Append("\\f"); break;
                default:
                    if (c < 0x20)
                    {
                        sb.Append("\\u").Append(((int)c).ToString("x4", System.Globalization.CultureInfo.InvariantCulture));
                    }
                    else
                    {
                        sb.Append(c);
                    }

                    break;
            }
        }

        sb.Append('"');
        return sb.ToString();
    }
}
