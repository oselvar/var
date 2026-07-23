using System.Linq;
using Varar.Core;
using Xunit;

namespace Varar.Core.Tests;

// Structurer syntax-level candidate marking (ADR 0012): mirrors structurer.test.ts additions.
public class StructurerTests
{
    [Fact]
    public void PrecededByDelimiterMarksCandidatesAfterAHeadingOrThematicBreak()
    {
        const string source = "First para.\n\nSecond para.\n\n---\n\nThird para.\n\n## H\n\nFourth para.";
        var varDoc = Structurer.Structure("d.md", source, Scanner.Scan(source));
        Assert.Equal(
            new[]
            {
                true,  // first candidate in the file
                false, // adjacent paragraph, no delimiter between
                true,  // after `---`
                true,  // after a heading
            },
            varDoc.Examples.Select(e => e.PrecededByDelimiter).ToArray());
    }
}
