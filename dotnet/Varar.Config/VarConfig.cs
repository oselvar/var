using System.Collections.Immutable;
using System.Text.Json;
using Varar.Core;

namespace Varar.Config;

/// <summary>Thrown on a malformed <c>varar.config.json</c>. The message starts with the config path.</summary>
public sealed class VarConfigException : Exception
{
    public VarConfigException(string message)
        : base(message)
    {
    }
}

/// <summary>Spec-doc discovery globs. Both are plain globs (no <c>!</c> prefix).</summary>
public sealed record VarGlobs(ImmutableArray<string> Include, ImmutableArray<string> Exclude);

/// <summary>
/// The parsed, unresolved shape of <c>varar.config.json</c> — pure data, shared byte-for-byte with
/// every port's reader. Port of <c>config-types.ts</c>.
/// </summary>
public sealed record ParsedVarConfig(
    VarGlobs Docs,
    ImmutableArray<string> Steps,
    ImmutableDictionary<string, string> Snippets);

/// <summary>
/// Strict, fail-loud reader of <c>varar.config.json</c>. Port of <c>config.ts</c>: no defaults for
/// docs/steps (a repo declares both), unknown keys and wrong types are errors, missing file → empty.
/// </summary>
public static class VarConfig
{
    private static readonly HashSet<string> KnownKeys =
        new(StringComparer.Ordinal) { "$schema", "docs", "steps", "snippets" };

    private static readonly HashSet<string> KnownDocsKeys =
        new(StringComparer.Ordinal) { "include", "exclude" };

    public static readonly ParsedVarConfig Empty = new(
        new VarGlobs([], []),
        [],
        ImmutableDictionary<string, string>.Empty);

    /// <summary>Parses config text (no filesystem). Fails loudly with the path prefixed.</summary>
    public static ParsedVarConfig Parse(string jsonText, string sourcePath)
    {
        JsonDocument doc;
        try
        {
            doc = JsonDocument.Parse(jsonText);
        }
        catch (JsonException e)
        {
            throw new VarConfigException($"{sourcePath}: invalid JSON: {e.Message}");
        }

        using (doc)
        {
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                throw new VarConfigException($"{sourcePath}: top level must be an object");
            }

            foreach (var prop in root.EnumerateObject())
            {
                if (!KnownKeys.Contains(prop.Name))
                {
                    throw new VarConfigException(
                        $"{sourcePath}: unknown key \"{prop.Name}\" (known keys: docs, steps, snippets)");
                }
            }

            var docs = Empty.Docs;
            if (root.TryGetProperty("docs", out var docsEl) && docsEl.ValueKind != JsonValueKind.Null)
            {
                if (docsEl.ValueKind != JsonValueKind.Object)
                {
                    throw new VarConfigException($"{sourcePath}: \"docs\" must be an object");
                }

                foreach (var prop in docsEl.EnumerateObject())
                {
                    if (!KnownDocsKeys.Contains(prop.Name))
                    {
                        throw new VarConfigException($"{sourcePath}: unknown key \"docs.{prop.Name}\" (known: include, exclude)");
                    }
                }

                docs = new VarGlobs(
                    StringArray(docsEl, "include", "docs.include", sourcePath),
                    StringArray(docsEl, "exclude", "docs.exclude", sourcePath));
            }

            var snippets = ImmutableDictionary<string, string>.Empty;
            if (root.TryGetProperty("snippets", out var snippetsEl) && snippetsEl.ValueKind != JsonValueKind.Null)
            {
                if (snippetsEl.ValueKind != JsonValueKind.Object ||
                    snippetsEl.EnumerateObject().Any(x => x.Value.ValueKind != JsonValueKind.String))
                {
                    throw new VarConfigException($"{sourcePath}: \"snippets\" must be an object of strings");
                }

                var builder = ImmutableDictionary.CreateBuilder<string, string>();
                foreach (var entry in snippetsEl.EnumerateObject())
                {
                    builder[entry.Name] = entry.Value.GetString()!;
                }

                snippets = builder.ToImmutable();
            }

            return new ParsedVarConfig(
                docs,
                StringArray(root, "steps", "steps", sourcePath),
                snippets);
        }
    }

    /// <summary>Reads <c>varar.config.json</c> from <paramref name="cwd"/>, or the empty config if absent.</summary>
    public static ParsedVarConfig Load(string cwd)
    {
        var path = Path.Combine(cwd, "varar.config.json");
        return File.Exists(path) ? Parse(File.ReadAllText(path), path) : Empty;
    }

    /// <summary>Projects the parsed config to the shared conformance wire shape.</summary>
    public static Value ToArtifact(ParsedVarConfig config) => Value.Map([
        new("docs", Value.Map([
            new("include", Value.List(config.Docs.Include.Select(Value.Of))),
            new("exclude", Value.List(config.Docs.Exclude.Select(Value.Of))),
        ])),
        new("steps", Value.List(config.Steps.Select(Value.Of))),
        new("snippets", Value.Map(config.Snippets.Select(kv => new KeyValuePair<string, Value>(kv.Key, Value.Of(kv.Value))))),
    ]);

    private static ImmutableArray<string> StringArray(JsonElement parent, string key, string label, string sourcePath)
    {
        if (!parent.TryGetProperty(key, out var value) || value.ValueKind == JsonValueKind.Null)
        {
            return [];
        }

        if (value.ValueKind != JsonValueKind.Array ||
            value.EnumerateArray().Any(v => v.ValueKind != JsonValueKind.String))
        {
            throw new VarConfigException($"{sourcePath}: \"{label}\" must be an array of strings");
        }

        return [.. value.EnumerateArray().Select(v => v.GetString()!)];
    }
}
