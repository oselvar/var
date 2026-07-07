package com.oselvar.var.core;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.regex.Pattern;

/**
 * The planner — port of {@code var-core/src/plan.ts}. For each {@link Ast.Example} in a {@link
 * Ast.VarDoc}, plans every text-bearing block via {@link Matcher}, lifts block-relative match
 * offsets to absolute source {@link Span}s, attaches trailing {@link Ast.Table}/{@link Ast.Fence}
 * nodes to the last step (data table / doc string), handles the {@code ```error} fence
 * convention, detects header-bound tables (expanding them into one example per row), and collects
 * {@code ambiguous-match}/{@code error-fence-without-step} diagnostics.
 *
 * <p>Java's {@code String}/{@code char} are already UTF-16 code-unit indexed (see {@link Span}'s
 * javadoc), so — like {@link Matcher} and unlike the Python port — this needs no code-point/UTF-16
 * conversion layer: every offset here is a plain {@code String} index throughout.
 */
public final class Plan {

    private Plan() {}

    // -----------------------------------------------------------------------------------------
    // Public types
    // -----------------------------------------------------------------------------------------

    /** The result of planning a whole {@link Ast.VarDoc}. */
    public record ExecutionPlan(
            Ast.VarDoc varDoc, List<PlannedExample> examples, List<Diagnostics.Diagnostic> diagnostics) {
        public ExecutionPlan {
            examples = List.copyOf(examples);
            diagnostics = List.copyOf(diagnostics);
        }
    }

    /**
     * One matched-and-runnable example.
     *
     * <p>{@code headerBinding}/{@code expectedOutcome}/{@code expectedErrorMessage} are {@code
     * null} when not applicable (TS's optional fields). {@code rowChecks} is {@code null} except
     * on a header-bound table's row examples.
     *
     * <p>{@code rowChecks} stays typed {@code List<?>} rather than {@code List<CellDiff.RowCheck>}
     * — matching this record's original interface spec — even though each element is now the
     * canonical {@link CellDiff.RowCheck} from {@code CellDiff.java} (this field predates that
     * type; see {@code CellDiff.java}'s javadoc for the {@code column}/{@code value}/{@code span}
     * shape).
     */
    public record PlannedExample(
            String name,
            List<String> scopeStack,
            Span span,
            List<PlannedStep> steps,
            HeaderBinding headerBinding,
            List<?> rowChecks,
            String expectedOutcome,
            String expectedErrorMessage) {
        public PlannedExample {
            scopeStack = List.copyOf(scopeStack);
            steps = List.copyOf(steps);
            if (rowChecks != null) rowChecks = List.copyOf(rowChecks);
        }
    }

    /**
     * Describes the binding paragraph shared by every row of a header-bound table: the matched
     * step's span in that paragraph, plus one span per header cell located where it appears there.
     */
    public record HeaderBinding(Span matchSpan, List<Span> paramSpans, Registry.StepRegistration stepDef) {
        public HeaderBinding {
            paramSpans = List.copyOf(paramSpans);
        }
    }

    /**
     * One matched step: its text, source span, captured-parameter spans, args, and attachments.
     * {@code formats} is copied from the {@link Matcher.Hit} — each captured argument's
     * parameter-type display formatter, aligned 1:1 with {@code args} ({@code null} entries
     * when the type has none) — so the executor can render parameter mismatches without
     * reaching back into the registry. Copied null-tolerantly ({@code List.copyOf} rejects
     * nulls).
     */
    public record PlannedStep(
            String text,
            Span matchSpan,
            List<Span> paramSpans,
            Registry.StepRegistration stepDef,
            List<Object> args,
            List<Function<Object, String>> formats,
            Ast.Table dataTable,
            Ast.Fence docString) {
        public PlannedStep {
            paramSpans = List.copyOf(paramSpans);
            args = List.copyOf(args);
            formats = Collections.unmodifiableList(new ArrayList<>(formats));
        }
    }

    // -----------------------------------------------------------------------------------------
    // Main entry point
    // -----------------------------------------------------------------------------------------

    /** Plans {@code doc} against {@code registry}: mirrors {@code plan()} in plan.ts exactly. */
    public static ExecutionPlan plan(Ast.VarDoc doc, Registry registry) {
        List<PlannedExample> examples = new ArrayList<>();
        List<Diagnostics.Diagnostic> diagnostics = new ArrayList<>();

        for (Ast.Example ex : doc.examples()) {
            boolean hadAmbiguous = false;
            List<Ast.Block> body = ex.body();

            // Pass 1: plan each text-bearing block and collect steps per body index.
            Map<Integer, List<PlannedStep>> stepsByBlock = new LinkedHashMap<>();
            for (int idx = 0; idx < body.size(); idx++) {
                Ast.Block block = body.get(idx);
                if (!isTextBearing(block)) continue;
                String text = textOf(block);
                BlockPlan result = planBlock(text, registry);
                for (Ambiguity collision : result.ambiguities()) {
                    Span span = liftSpan(doc.source(), block, collision.matchStart(), collision.matchEnd());
                    diagnostics.add(Diagnostics.ambiguousMatch(span));
                    hadAmbiguous = true;
                }
                if (!hadAmbiguous && !result.steps().isEmpty()) {
                    List<PlannedStep> blockSteps =
                            new ArrayList<>(result.steps().size());
                    for (Matcher.Hit hit : result.steps()) {
                        List<Span> paramSpans = new ArrayList<>(hit.paramSpans().size());
                        for (Matcher.ParamSpan p : hit.paramSpans()) {
                            paramSpans.add(liftSpan(doc.source(), block, p.start(), p.end()));
                        }
                        blockSteps.add(new PlannedStep(
                                text.substring(hit.matchStart(), hit.matchEnd()),
                                liftSpan(doc.source(), block, hit.matchStart(), hit.matchEnd()),
                                paramSpans,
                                hit.stepDef(),
                                hit.args(),
                                hit.formats(),
                                null,
                                null));
                    }
                    stepsByBlock.put(idx, blockSteps);
                }
            }

            // Header-bound table: a table whose every header cell is named (whole word,
            // case-sensitive) in the matched paragraph above it iterates row by row. The matched
            // step runs once per data row, receiving the row as an object keyed by header cell,
            // and each row becomes its own example.
            HeaderBoundResult bound = hadAmbiguous ? null : detectHeaderBound(body, stepsByBlock, doc.source());
            if (bound != null) {
                HeaderBinding headerBinding = new HeaderBinding(
                        bound.step().matchSpan(),
                        bound.headerSpans(),
                        bound.step().stepDef());
                List<String> headerCells = bound.table().header().cells();
                for (Ast.Row row : bound.table().rows()) {
                    Map<String, String> rowObject = new LinkedHashMap<>();
                    for (int i = 0; i < headerCells.size(); i++) {
                        rowObject.put(headerCells.get(i), cellAt(row, i));
                    }
                    List<Object> rowArgs = new ArrayList<>(bound.step().args());
                    rowArgs.add(rowObject);
                    PlannedStep rowStep = new PlannedStep(
                            bound.step().text(),
                            row.span(),
                            bound.step().paramSpans(),
                            bound.step().stepDef(),
                            rowArgs,
                            bound.step().formats(),
                            null,
                            null);
                    List<CellDiff.RowCheck> rowChecks = new ArrayList<>(headerCells.size());
                    for (int i = 0; i < headerCells.size(); i++) {
                        rowChecks.add(new CellDiff.RowCheck(headerCells.get(i), cellAt(row, i), cellSpanAt(row, i)));
                    }
                    List<String> nestedScope = new ArrayList<>(ex.scopeStack());
                    nestedScope.add(bound.step().text());
                    examples.add(new PlannedExample(
                            String.join(" / ", row.cells()),
                            nestedScope,
                            row.span(),
                            List.of(rowStep),
                            headerBinding,
                            rowChecks,
                            null,
                            null));
                }
                continue;
            }

            // An ```error fence anywhere in this example marks it expected-to-fail and is consumed
            // here (never attached to a step as a doc string).
            Ast.Fence errorFence = null;
            for (Ast.Block b : body) {
                if (b instanceof Ast.Fence f && "error".equals(f.info())) {
                    errorFence = f;
                    break;
                }
            }

            // Pass 2: look for table/fence immediately after a step-bearing block.
            Map<Integer, Attachment> attachments = new LinkedHashMap<>();
            for (int idx = 1; idx < body.size(); idx++) {
                Ast.Block here = body.get(idx);
                if (here instanceof Ast.Table table && stepsByBlock.containsKey(idx - 1)) {
                    Attachment prev = attachments.get(idx - 1);
                    attachments.put(idx - 1, new Attachment(table, prev == null ? null : prev.docString()));
                } else if (here instanceof Ast.Fence fence
                        && !"error".equals(fence.info())
                        && stepsByBlock.containsKey(idx - 1)) {
                    Attachment prev = attachments.get(idx - 1);
                    attachments.put(idx - 1, new Attachment(prev == null ? null : prev.dataTable(), fence));
                }
            }

            // Pass 3: rebuild final step list, applying attachments to the last step of each block.
            List<PlannedStep> finalSteps = new ArrayList<>();
            for (int idx = 0; idx < body.size(); idx++) {
                List<PlannedStep> stepsAtIdx = stepsByBlock.getOrDefault(idx, List.of());
                Attachment attachAt = attachments.get(idx);
                for (int s = 0; s < stepsAtIdx.size(); s++) {
                    PlannedStep step = stepsAtIdx.get(s);
                    if (s == stepsAtIdx.size() - 1 && attachAt != null) {
                        finalSteps.add(new PlannedStep(
                                step.text(),
                                step.matchSpan(),
                                step.paramSpans(),
                                step.stepDef(),
                                step.args(),
                                step.formats(),
                                attachAt.dataTable(),
                                attachAt.docString()));
                    } else {
                        finalSteps.add(step);
                    }
                }
            }

            List<PlannedStep> runnableSteps = hadAmbiguous ? List.of() : finalSteps;

            // An `error` fence declares the example expected-to-fail, but here there's no
            // runnable step to produce that failure (nothing matched, or the match was
            // ambiguous). That's an author mistake, not silent Markdown — flag it.
            if (errorFence != null && runnableSteps.isEmpty()) {
                diagnostics.add(Diagnostics.errorFenceWithoutStep(errorFence.span()));
            }

            if (finalSteps.isEmpty() && !hadAmbiguous) {
                // Example has no matches — drop it (docs). Any `error`-fence mistake was already
                // reported just above.
                continue;
            }

            String expectedOutcome = null;
            String expectedErrorMessage = null;
            if (errorFence != null) {
                expectedOutcome = "fail";
                String trimmed = errorFence.body().strip();
                if (!trimmed.isEmpty()) expectedErrorMessage = trimmed;
            }

            examples.add(new PlannedExample(
                    deriveExampleName(body),
                    ex.scopeStack(),
                    ex.span(),
                    runnableSteps,
                    null,
                    null,
                    expectedOutcome,
                    expectedErrorMessage));
        }

        // A table or fence that doesn't attach to a step is just Markdown content, not a mistake
        // — it produces no diagnostic.

        return new ExecutionPlan(doc, examples, diagnostics);
    }

    // -----------------------------------------------------------------------------------------
    // Internal: block-level planning
    // -----------------------------------------------------------------------------------------

    private record Ambiguity(int matchStart, int matchEnd, List<Matcher.Hit> candidates) {}

    private record BlockPlan(List<Matcher.Hit> steps, List<Ambiguity> ambiguities) {}

    private static BlockPlan planBlock(String text, Registry registry) {
        List<Matcher.Hit> allSteps = new ArrayList<>();
        List<Ambiguity> allAmbiguities = new ArrayList<>();
        for (Sentences.Sentence sentence : Sentences.splitSentences(text)) {
            List<Matcher.Hit> hits = Matcher.findHits(sentence.text(), registry);
            List<Matcher.Hit> adjusted = new ArrayList<>(hits.size());
            for (Matcher.Hit h : hits) {
                List<Matcher.ParamSpan> paramSpans =
                        new ArrayList<>(h.paramSpans().size());
                for (Matcher.ParamSpan p : h.paramSpans()) {
                    paramSpans.add(new Matcher.ParamSpan(
                            p.start() + sentence.startOffset(), p.end() + sentence.startOffset()));
                }
                adjusted.add(new Matcher.Hit(
                        h.expression(),
                        h.stepDef(),
                        h.matchStart() + sentence.startOffset(),
                        h.matchEnd() + sentence.startOffset(),
                        h.args(),
                        paramSpans,
                        h.formats()));
            }
            Matcher.ResolvedSteps resolved = Matcher.resolveHits(adjusted);
            if (resolved instanceof Matcher.Ambiguous ambiguous) {
                for (Matcher.AmbiguityCollision c : ambiguous.collisions()) {
                    allAmbiguities.add(new Ambiguity(c.matchStart(), c.matchEnd(), c.candidates()));
                }
            } else if (resolved instanceof Matcher.Ok ok && !ok.steps().isEmpty()) {
                allSteps.addAll(ok.steps());
            }
            // No keyword-led "missing step" detection — by design. Step-def generation is
            // selection-driven only, never inferred from sentence shape.
        }
        return new BlockPlan(List.copyOf(allSteps), List.copyOf(allAmbiguities));
    }

    // -----------------------------------------------------------------------------------------
    // Internal: header-bound table detection
    // -----------------------------------------------------------------------------------------

    private record HeaderBoundResult(Ast.Table table, PlannedStep step, List<Span> headerSpans) {}

    /**
     * Finds the first table in this example whose every header cell appears as a whole word
     * (case-sensitive) in the step-bearing block immediately above it. Returns that table together
     * with the step it binds to (the block's last matched step — the one a trailing table would
     * otherwise attach to).
     */
    private static HeaderBoundResult detectHeaderBound(
            List<Ast.Block> body, Map<Integer, List<PlannedStep>> stepsByBlock, String source) {
        for (int idx = 1; idx < body.size(); idx++) {
            Ast.Block here = body.get(idx);
            if (!(here instanceof Ast.Table table)) continue;
            Ast.Block above = body.get(idx - 1);
            if (!isTextBearing(above)) continue;
            List<PlannedStep> steps = stepsByBlock.get(idx - 1);
            if (steps == null || steps.isEmpty()) continue;
            String aboveText = textOf(above);
            List<String> headerCells = table.header().cells();
            int[] offsets = new int[headerCells.size()];
            boolean anyMissing = false;
            for (int i = 0; i < headerCells.size(); i++) {
                offsets[i] = wordOffset(aboveText, headerCells.get(i));
                if (offsets[i] < 0) anyMissing = true;
            }
            if (anyMissing) continue;
            List<Span> headerSpans = new ArrayList<>(headerCells.size());
            for (int i = 0; i < headerCells.size(); i++) {
                headerSpans.add(liftSpan(
                        source,
                        above,
                        offsets[i],
                        offsets[i] + headerCells.get(i).length()));
            }
            return new HeaderBoundResult(table, steps.get(steps.size() - 1), List.copyOf(headerSpans));
        }
        return null;
    }

    /** Offset of {@code word} in {@code haystack} as a whole word (case-sensitive), or -1. */
    private static int wordOffset(String haystack, String word) {
        String escaped = escapeRegex(word);
        Pattern pattern = Pattern.compile("(?<![\\p{L}\\p{N}_])" + escaped + "(?![\\p{L}\\p{N}_])");
        java.util.regex.Matcher m = pattern.matcher(haystack);
        return m.find() ? m.start() : -1;
    }

    private static String escapeRegex(String s) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (".*+?^${}()|[]\\".indexOf(c) >= 0) sb.append('\\');
            sb.append(c);
        }
        return sb.toString();
    }

    // -----------------------------------------------------------------------------------------
    // Internal: attachments (pass 2/3 support)
    // -----------------------------------------------------------------------------------------

    private record Attachment(Ast.Table dataTable, Ast.Fence docString) {}

    // -----------------------------------------------------------------------------------------
    // Internal: example naming
    // -----------------------------------------------------------------------------------------

    static String deriveExampleName(List<Ast.Block> body) {
        Ast.Block primary = null;
        for (Ast.Block b : body) {
            if (isTextBearing(b)) {
                primary = b;
                break;
            }
        }
        if (primary == null) return "";
        // The entire paragraph is the test name — an example is often a paragraph where only
        // some sentences match steps, and the narration around them is part of what the test
        // asserts about. Hard line breaks inside the paragraph collapse to single spaces (test
        // names must be one line), and a single trailing . ! ? is stripped; embedded
        // terminators (e.g. inside `i.e.` or a quoted string) are left alone.
        String name = textOf(primary).replaceAll("\\s+", " ").trim();
        if (!name.isEmpty()) {
            char last = name.charAt(name.length() - 1);
            if (last == '.' || last == '!' || last == '?') {
                name = name.substring(0, name.length() - 1);
            }
        }
        return name;
    }

    // -----------------------------------------------------------------------------------------
    // Internal: block text/span helpers
    // -----------------------------------------------------------------------------------------

    private static boolean isTextBearing(Ast.Block block) {
        return block instanceof Ast.Paragraph || block instanceof Ast.ListItem || block instanceof Ast.Blockquote;
    }

    /** Text of a text-bearing block. Throws if {@code block} isn't one — call sites always check. */
    private static String textOf(Ast.Block block) {
        return switch (block) {
            case Ast.Paragraph p -> p.text();
            case Ast.ListItem l -> l.text();
            case Ast.Blockquote b -> b.text();
            default -> throw new IllegalStateException("not a text-bearing block: " + block);
        };
    }

    private static String cellAt(Ast.Row row, int i) {
        return i < row.cells().size() ? row.cells().get(i) : "";
    }

    private static Span cellSpanAt(Ast.Row row, int i) {
        return i < row.cellSpans().size() ? row.cellSpans().get(i) : row.span();
    }

    /**
     * Maps a {@code [blockStart, blockEnd)} UTF-16 offset range within a block's text back to a
     * source-document {@link Span}, via that block's {@code segmentMap}. Non-text-bearing blocks
     * (which carry no segment map) return their own span unchanged — mirrors {@code liftSpan}'s
     * defensive fallback in plan.ts.
     */
    private static Span liftSpan(String source, Ast.Block block, int blockStart, int blockEnd) {
        List<Ast.SegmentOffset> segmentMap =
                switch (block) {
                    case Ast.Paragraph p -> p.segmentMap();
                    case Ast.ListItem l -> l.segmentMap();
                    case Ast.Blockquote b -> b.segmentMap();
                    default -> null;
                };
        if (segmentMap == null) return spanOf(block);
        return liftFromSegmentMap(source, segmentMap, blockStart, blockEnd);
    }

    private static Span liftFromSegmentMap(
            String source, List<Ast.SegmentOffset> segmentMap, int blockStart, int blockEnd) {
        int start = liftSegmentOffset(segmentMap, blockStart);
        int end = liftSegmentOffset(segmentMap, blockEnd);
        return Span.spanFromOffsets(source, start, end);
    }

    private static int liftSegmentOffset(List<Ast.SegmentOffset> segmentMap, int textOffset) {
        Ast.SegmentOffset best = segmentMap.isEmpty() ? null : segmentMap.get(0);
        for (Ast.SegmentOffset entry : segmentMap) {
            if (entry.textOffset() <= textOffset) best = entry;
        }
        if (best == null) throw new IllegalStateException("empty segmentMap");
        return best.sourceOffset() + (textOffset - best.textOffset());
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
