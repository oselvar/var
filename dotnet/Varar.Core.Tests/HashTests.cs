using Varar.Core;
using Xunit;

namespace Varar.Core.Tests;

// Translated from hash.test.ts.
public class HashTests
{
    [Fact]
    public void IsDeterministicForTheSameInput() =>
        Assert.Equal(Hash.HashSource("abc"), Hash.HashSource("abc"));

    [Fact]
    public void ChangesForAOneCharacterDifference() =>
        Assert.NotEqual(Hash.HashSource("abc"), Hash.HashSource("abd"));

    [Fact]
    public void IsNamespacedWithTheAlgorithmPrefix() =>
        Assert.StartsWith("fnv1a:", Hash.HashSource("abc"));

    [Fact]
    public void MatchesStableKnownVectors()
    {
        Assert.Equal("fnv1a:4f9f2cab", Hash.HashSource("hello"));
        Assert.Equal("fnv1a:1a47e90b", Hash.HashSource("abc"));
        Assert.Equal("fnv1a:4eace75e", Hash.HashSource("# Title\n"));
    }
}
