using System.IO;
using Varar.Core;
using Xunit;

namespace Varar.Tests;

/// <summary>
/// The <c>registry.json</c> golden gate (T4): for every bundle, building the registry from its C#
/// <c>Register</c> fixture and projecting with <see cref="Conformance.ToRegistryArtifact"/> must
/// reproduce the committed <c>golden/registry.json</c> byte-for-byte.
/// </summary>
public class RegistryConformanceTests
{
    public static TheoryData<string> Bundles()
    {
        var data = new TheoryData<string>();
        foreach (var bundle in ConformanceFixtures.Register.Keys)
        {
            data.Add(bundle);
        }

        return data;
    }

    [Theory]
    [MemberData(nameof(Bundles))]
    public void RegistryMatchesGolden(string bundle)
    {
        var registry = ConformanceFixtures.Register[bundle](Registry.Create());
        var actual = CanonicalJson.Stringify(Conformance.ToRegistryArtifact(registry));

        var expected = File.ReadAllText(Path.Combine(BundlesDir(), bundle, "golden", "registry.json"));
        Assert.Equal(expected, actual);
    }

    [Fact]
    public void EveryBundleHasAFixture() => Assert.Equal(15, ConformanceFixtures.Register.Count);

    private static string BundlesDir()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, "conformance", "bundles")))
        {
            dir = dir.Parent;
        }

        return dir is not null
            ? Path.Combine(dir.FullName, "conformance", "bundles")
            : throw new DirectoryNotFoundException("could not locate conformance/bundles");
    }
}
