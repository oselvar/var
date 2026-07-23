using System.Collections.Immutable;

namespace Varar.Core;

/// <summary>
/// Turns the flat block stream into examples under heading scopes. Port of <c>structurer.ts</c>.
/// Paragraph/list-item/blockquote become candidate examples; headings are scope markers; tables and
/// fences immediately following a candidate (no heading or thematic break between) attach to it,
/// otherwise they are orphans.
/// <para>
/// This is pure syntax — it does NOT decide where one example ends and the next begins. Instead
/// each candidate records <c>PrecededByDelimiter</c> (a heading or <c>---</c> sits before it), and
/// the planner groups adjacent matching candidates into examples using that flag plus which
/// candidates match a step. See ADR 0012.
/// </para>
/// </summary>
public static class Structurer
{
    public static VarDoc Structure(string path, string source, ImmutableArray<Block> blocks)
    {
        var examples = new List<Example>();
        var orphanAttachments = ImmutableArray.CreateBuilder<Block>();
        var scopeStack = new List<(int Level, string Text)>();
        int lastExampleIdx = -1;
        bool attachmentOpen = false;

        // A heading or thematic break seen since the previous candidate — the next candidate is
        // then delimiter-preceded. Starts true so the first candidate in the file counts as
        // delimiter-preceded (nothing to merge into).
        bool delimiterPending = true;

        foreach (var block in blocks)
        {
            switch (block)
            {
                case Heading heading:
                    while (scopeStack.Count > 0 && scopeStack[^1].Level >= heading.Level)
                    {
                        scopeStack.RemoveAt(scopeStack.Count - 1);
                    }

                    scopeStack.Add((heading.Level, heading.Text));
                    attachmentOpen = false;
                    delimiterPending = true;
                    break;

                case Paragraph:
                case ListItem:
                case Blockquote:
                    examples.Add(new Example(
                        [.. scopeStack.Select(s => s.Text)],
                        block.Span,
                        [block],
                        delimiterPending));
                    lastExampleIdx = examples.Count - 1;
                    attachmentOpen = true;
                    delimiterPending = false;
                    break;

                case Table:
                case Fence:
                    if (attachmentOpen && lastExampleIdx >= 0)
                    {
                        var prev = examples[lastExampleIdx];
                        var mergedSpan = Span.FromOffsets(source, prev.Span.StartOffset, block.Span.EndOffset);
                        examples[lastExampleIdx] = prev with { Span = mergedSpan, Body = prev.Body.Add(block) };
                        break;
                    }

                    orphanAttachments.Add(block);
                    break;

                case ThematicBreak:
                    attachmentOpen = false;
                    delimiterPending = true;
                    break;
            }
        }

        return new VarDoc(path, source, [.. examples], orphanAttachments.ToImmutable());
    }
}
