package dev.varar.core;

import java.util.List;

/**
 * AST node types produced by the parser/structurer — a direct port of
 * {@code var-core/src/ast.ts} (type definitions only; that file carries no logic).
 *
 * <p>All node types are nested inside this single class rather than declared as
 * top-level types, one per file. Java allows only one public top-level type per
 * file (its name must match the file name), but every node here needs to be
 * {@code public} — later ports (the {@code var} facade, {@code var-junit},
 * {@code var-runner}) live in other packages and must reference {@link Block},
 * {@link VarDoc}, etc. directly. Nesting them as {@code public static} members of
 * {@code Ast} satisfies both constraints in one file, keeps a reviewable
 * module-for-module mapping with {@code ast.ts}, and avoids a dozen near-empty
 * one-record files for what is a pure-data module.
 *
 * <p>Every record with a {@code List} field defensively copies it into an
 * unmodifiable view via a compact canonical constructor ({@link List#copyOf}), so
 * the AST is immutable regardless of what a caller passes in — TS enforces this
 * with {@code readonly}/{@code ReadonlyArray}; Java records give no such guarantee
 * for reference-typed fields without doing it explicitly.
 */
public final class Ast {

    private Ast() {}

    /**
     * Maps a block-text offset to its source offset. Block text is the raw
     * source minus BLOCK markers only (list bullets, blockquote {@code >}
     * prefixes), so a paragraph or list item has a single entry and a
     * blockquote one entry per quoted line. Inline markup is never stripped —
     * see {@code doc/superpowers/specs/2026-07-06-explicit-inline-format-plugins-design.md}.
     */
    public record SegmentOffset(int textOffset, int sourceOffset) {}

    /**
     * A markdown block node, as matched by the structurer. The closed set of
     * variants below is the full union — exhaustive {@code switch} pattern
     * matching over {@code Block} replaces TS's {@code kind}-discriminated union
     * narrowing, with the compiler enforcing exhaustiveness.
     */
    public sealed interface Block permits Heading, Paragraph, ListItem, Blockquote, Table, Fence, ThematicBreak {}

    /** A markdown heading ({@code #}..{@code ######}); {@code level} is 1-6. */
    public record Heading(int level, String text, Span span) implements Block {}

    /** A markdown paragraph. */
    public record Paragraph(String text, Span span, List<SegmentOffset> segmentMap) implements Block {
        public Paragraph {
            segmentMap = List.copyOf(segmentMap);
        }
    }

    /** A single list item ({@code -}/{@code *} or numbered). */
    public record ListItem(String text, Span span, List<SegmentOffset> segmentMap, boolean ordered, Span markerSpan)
            implements Block {
        public ListItem {
            segmentMap = List.copyOf(segmentMap);
        }
    }

    /** A markdown blockquote ({@code >}). */
    public record Blockquote(String text, Span span, List<SegmentOffset> segmentMap) implements Block {
        public Blockquote {
            segmentMap = List.copyOf(segmentMap);
        }
    }

    /** One row of a table: {@code cells} and {@code cellSpans} are parallel, same-length lists. */
    public record Row(List<String> cells, List<Span> cellSpans, Span span) {
        public Row {
            cells = List.copyOf(cells);
            cellSpans = List.copyOf(cellSpans);
        }
    }

    /**
     * Marker union of the block kinds that may appear as a {@link VarDoc}
     * orphan attachment — mirrors the TS union type {@code Table | Fence}
     * (ast.ts:79-84).
     */
    public sealed interface TableOrFence permits Table, Fence {}

    /** A markdown table: a header {@link Row} plus zero or more data rows. */
    public record Table(Span span, Row header, List<Row> rows) implements Block, TableOrFence {
        public Table {
            rows = List.copyOf(rows);
        }
    }

    /** A fenced code block; {@code info} is the text after the opening fence (e.g. a language tag). */
    public record Fence(Span span, String info, String body, Span bodySpan) implements Block, TableOrFence {}

    /** A thematic break ({@code ---}/{@code ***}/{@code ___}). */
    public record ThematicBreak(Span span) implements Block {}

    /**
     * One matched example.
     *
     * @param scopeStack the chain of heading texts above this block, outer→inner.
     *     An example directly at file scope (no enclosing heading) has an empty
     *     stack. The runtime turns this into nested {@code describe} calls.
     * @param body always non-empty. First entry is the candidate primary block
     *     (paragraph / list_item / blockquote). Any trailing tables or fences are
     *     appended by the structurer so the planner can attach them to the last
     *     matched step.
     * @param precededByDelimiter true when a heading or thematic break ({@code
     *     ---}) sits between this candidate and the previous one — i.e. a
     *     syntactic delimiter separates them (also true for the first candidate).
     *     The planner uses it to decide grouping: a matching candidate with this
     *     false merges into the open example rather than starting a new one. See
     *     ADR 0012.
     */
    public record Example(List<String> scopeStack, Span span, List<Block> body, boolean precededByDelimiter) {
        public Example {
            scopeStack = List.copyOf(scopeStack);
            body = List.copyOf(body);
        }
    }

    /** A parsed source file: its matched examples plus any table/fence blocks not attached to one. */
    public record VarDoc(String path, String source, List<Example> examples, List<TableOrFence> orphanAttachments) {
        public VarDoc {
            examples = List.copyOf(examples);
            orphanAttachments = List.copyOf(orphanAttachments);
        }
    }
}
