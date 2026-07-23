package dev.varar.core;

import java.util.ArrayList;
import java.util.List;

/**
 * Groups the flat {@link Scanner#scan} output into {@link Ast.Example}s, tracking a heading scope
 * stack as it walks the blocks.
 *
 * <p>Port of {@code var-core/src/structurer.ts}. Every paragraph / list item / blockquote becomes
 * a candidate example. The names come later (the planner takes the first sentence). Headings are
 * scope markers: they wrap whatever candidate blocks fall under them into nested {@code describe}
 * groups at runtime.
 *
 * <p>Tables and fences immediately following a candidate (with no intervening heading or thematic
 * break) attach to that candidate's body so the planner can hand them to the last matched step.
 * Otherwise they're orphans, collected into {@link Ast.VarDoc#orphanAttachments}.
 *
 * <p>This is pure syntax — it does NOT decide where one example ends and the next begins. Instead
 * each candidate records {@link Ast.Example#precededByDelimiter} (a heading or {@code ---} sits
 * before it), and the planner groups adjacent matching candidates into examples using that flag
 * plus which candidates match a step. See ADR 0012.
 */
public final class Structurer {

    private Structurer() {}

    /** One entry of the heading scope stack: a heading's level plus its text. */
    private record ScopeEntry(int level, String text) {}

    /** Groups {@code blocks} (as scanned from {@code source}) into a {@link Ast.VarDoc}. */
    public static Ast.VarDoc structure(String path, String source, List<Ast.Block> blocks) {
        List<Ast.Example> examples = new ArrayList<>();
        List<Ast.TableOrFence> orphanAttachments = new ArrayList<>();
        List<ScopeEntry> scopeStack = new ArrayList<>();
        int lastExampleIdx = -1;
        boolean attachmentOpen = false;
        // A heading or thematic break seen since the previous candidate — the next candidate is
        // then delimiter-preceded. Starts true so the first candidate in the file counts as
        // delimiter-preceded (nothing to merge into).
        boolean delimiterPending = true;

        for (Ast.Block block : blocks) {
            if (block instanceof Ast.Heading heading) {
                // Pop deeper-or-equal-level entries before pushing the new heading.
                while (!scopeStack.isEmpty()
                        && scopeStack.get(scopeStack.size() - 1).level() >= heading.level()) {
                    scopeStack.remove(scopeStack.size() - 1);
                }
                scopeStack.add(new ScopeEntry(heading.level(), heading.text()));
                attachmentOpen = false;
                delimiterPending = true;
            } else if (block instanceof Ast.Paragraph
                    || block instanceof Ast.ListItem
                    || block instanceof Ast.Blockquote) {
                Span blockSpan = spanOf(block);
                examples.add(new Ast.Example(scopeTexts(scopeStack), blockSpan, List.of(block), delimiterPending));
                lastExampleIdx = examples.size() - 1;
                attachmentOpen = true;
                delimiterPending = false;
            } else if (block instanceof Ast.TableOrFence attachment) {
                if (attachmentOpen && lastExampleIdx >= 0) {
                    Ast.Example prev = examples.get(lastExampleIdx);
                    Span blockSpan = spanOf(block);
                    Span span = Span.spanFromOffsets(source, prev.span().startOffset(), blockSpan.endOffset());
                    List<Ast.Block> body = new ArrayList<>(prev.body());
                    body.add(block);
                    examples.set(
                            lastExampleIdx, new Ast.Example(prev.scopeStack(), span, body, prev.precededByDelimiter()));
                } else {
                    orphanAttachments.add(attachment);
                }
            } else if (block instanceof Ast.ThematicBreak) {
                attachmentOpen = false;
                delimiterPending = true;
            }
        }

        return new Ast.VarDoc(path, source, examples, orphanAttachments);
    }

    private static List<String> scopeTexts(List<ScopeEntry> scopeStack) {
        List<String> texts = new ArrayList<>(scopeStack.size());
        for (ScopeEntry entry : scopeStack) {
            texts.add(entry.text());
        }
        return texts;
    }

    /** Exhaustive span accessor over the sealed {@link Ast.Block} union (no common interface method). */
    private static Span spanOf(Ast.Block block) {
        return switch (block) {
            case Ast.Heading h -> h.span();
            case Ast.Paragraph p -> p.span();
            case Ast.ListItem l -> l.span();
            case Ast.Blockquote b -> b.span();
            case Ast.Table t -> t.span();
            case Ast.Fence f -> f.span();
            case Ast.ThematicBreak t -> t.span();
        };
    }
}
