package com.oselvar.var.core;

import com.oselvar.var.core.Ast.Block;
import com.oselvar.var.core.Ast.InlineOffset;
import com.oselvar.var.core.Ast.Row;
import com.oselvar.var.core.Inline.InlineResult;
import com.oselvar.var.core.TableCells.RowCells;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Turns raw Markdown source into a flat list of {@link Block} nodes: headings, paragraphs, list
 * items, blockquotes, fenced code, thematic breaks, tables.
 *
 * <p>Port of {@code var-core/src/scanner.ts}. Java's {@code String}/{@code char} are already
 * UTF-16 code-unit indexed (see {@link Span}'s javadoc), so — as with the other core modules —
 * this iterates and slices directly on {@code String}/{@code Matcher} offsets, exactly as {@code
 * scanner.ts} does, with no code-point conversion layer. {@code java.util.regex.Pattern}'s {@code
 * ^}/{@code $} anchors and {@code Matcher.start()}/{@code .end()} land on the same UTF-16 units as
 * JS's regex {@code .index}, confirmed here (see {@code astralParagraphSpanEndOffsetIsUtf16CodeUnits}
 * in {@code ScannerTest}) exactly as every prior module found.
 *
 * <p>The {@code plugins} parameter carried by {@code scanner.ts}'s (and the Python port's) {@code
 * scan} signature is intentionally out of scope here — no scanner plugin is needed by this port
 * yet (mirrors the Python port's Task 5 note); {@link #scan} takes no plugins parameter at all.
 */
public final class Scanner {

    private Scanner() {}

    /**
     * A scanner-line: one line of source between (or before/after) {@code \n} boundaries, plus its
     * start/end offsets in the full source. Package-private — internal to the scanner.
     */
    record RawLine(String text, int startOffset, int endOffset) {}

    private static final Pattern THEMATIC_RE = Pattern.compile("^\\s*([-*_])(\\s*\\1){2,}\\s*$");
    private static final Pattern UL_RE = Pattern.compile("^(\\s*)([-*+])\\s+(.*)$");
    private static final Pattern OL_RE = Pattern.compile("^(\\s*)(\\d+)([.)])\\s+(.*)$");
    private static final Pattern BQ_RE = Pattern.compile("^>\\s?(.*)$");
    private static final Pattern FENCE_RE = Pattern.compile("^(`{3,})\\s*(\\S*)\\s*$");
    private static final Pattern ROW_RE = Pattern.compile("^\\|(.+)\\|\\s*$");
    private static final Pattern DELIM_RE =
            Pattern.compile("^\\|\\s*:?-+:?\\s*(\\|\\s*:?-+:?\\s*)*\\|\\s*$");
    private static final Pattern HEADING_RE = Pattern.compile("^(#{1,6})\\s+(.*?)(?:\\s+#+)?\\s*$");
    private static final Pattern HEADING_PREFIX_RE = Pattern.compile("^#{1,6}\\s+");

    /** Scans {@code source} into an immutable-content list of {@link Block} nodes. */
    public static List<Block> scan(String source) {
        List<Block> blocks = new ArrayList<>();
        List<RawLine> lines = splitLines(source);

        int i = 0;
        while (i < lines.size()) {
            RawLine line = lines.get(i);
            if (line.text().trim().isEmpty()) {
                i++;
                continue;
            }

            FenceResult fence = tryFence(source, lines, i);
            if (fence != null) {
                blocks.add(fence.fence());
                i = fence.next();
                continue;
            }
            TableResult tableResult = tryTable(source, lines, i);
            if (tableResult != null) {
                blocks.add(tableResult.table());
                i = tableResult.next();
                continue;
            }
            Block thematic = tryThematicBreak(source, line);
            if (thematic != null) {
                blocks.add(thematic);
                i++;
                continue;
            }
            BlockquoteResult bqResult = tryBlockquote(source, lines, i);
            if (bqResult != null) {
                blocks.add(bqResult.quote());
                i = bqResult.next();
                continue;
            }
            Block heading = tryHeading(source, line);
            if (heading != null) {
                blocks.add(heading);
                i++;
                continue;
            }
            Block listItem = tryListItem(source, line);
            if (listItem != null) {
                blocks.add(listItem);
                i++;
                continue;
            }
            ParagraphResult paragraphResult = consumeParagraph(source, lines, i);
            blocks.add(paragraphResult.paragraph());
            i = paragraphResult.next();
        }
        return List.copyOf(blocks);
    }

    private static List<RawLine> splitLines(String source) {
        List<RawLine> out = new ArrayList<>();
        int start = 0;
        int n = source.length();
        for (int i = 0; i < n; i++) {
            if (source.charAt(i) == '\n') {
                out.add(new RawLine(source.substring(start, i), start, i));
                start = i + 1;
            }
        }
        if (start <= n) {
            out.add(new RawLine(source.substring(start), start, n));
        }
        return out;
    }

    private static Block tryThematicBreak(String source, RawLine line) {
        if (!THEMATIC_RE.matcher(line.text()).find()) return null;
        return new Ast.ThematicBreak(Span.spanFromOffsets(source, line.startOffset(), line.endOffset()));
    }

    private static Block tryHeading(String source, RawLine line) {
        Matcher m = HEADING_RE.matcher(line.text());
        if (!m.find()) return null;
        String hashes = m.group(1);
        String text = m.group(2).trim();
        int level = hashes.length();
        Span span = Span.spanFromOffsets(source, line.startOffset(), line.endOffset());
        return new Ast.Heading(level, text, span);
    }

    private static Block tryListItem(String source, RawLine line) {
        Matcher ul = UL_RE.matcher(line.text());
        if (ul.find()) {
            String rawText = ul.group(3);
            int markerStart = line.startOffset() + ul.group(1).length();
            int markerEnd = markerStart + ul.group(2).length();
            int textStart = line.startOffset() + line.text().indexOf(rawText);
            InlineResult stripped = Inline.stripInline(rawText, textStart);
            return new Ast.ListItem(
                    stripped.text(),
                    Span.spanFromOffsets(source, line.startOffset(), line.endOffset()),
                    stripped.map(),
                    false,
                    Span.spanFromOffsets(source, markerStart, markerEnd));
        }
        Matcher ol = OL_RE.matcher(line.text());
        if (ol.find()) {
            String rawText = ol.group(4);
            int markerStart = line.startOffset() + ol.group(1).length();
            int markerEnd = markerStart + ol.group(2).length() + ol.group(3).length();
            int textStart = line.startOffset() + line.text().indexOf(rawText);
            InlineResult stripped = Inline.stripInline(rawText, textStart);
            return new Ast.ListItem(
                    stripped.text(),
                    Span.spanFromOffsets(source, line.startOffset(), line.endOffset()),
                    stripped.map(),
                    true,
                    Span.spanFromOffsets(source, markerStart, markerEnd));
        }
        return null;
    }

    private record BlockquoteResult(Ast.Blockquote quote, int next) {}

    private static BlockquoteResult tryBlockquote(String source, List<RawLine> lines, int startIdx) {
        RawLine first = lines.get(startIdx);
        Matcher m = BQ_RE.matcher(first.text());
        if (!m.find()) return null;

        String firstSegmentRaw = m.group(1);
        int firstSegmentSourceBase = first.startOffset() + first.text().indexOf(firstSegmentRaw);
        InlineResult firstStripped = Inline.stripInline(firstSegmentRaw, firstSegmentSourceBase);

        List<String> strippedSegments = new ArrayList<>();
        strippedSegments.add(firstStripped.text());
        List<InlineOffset> inlineMap = new ArrayList<>(firstStripped.map());
        int joinedTextOffset = firstStripped.text().length();

        int i = startIdx + 1;
        int endOffset = first.endOffset();
        while (i < lines.size()) {
            RawLine ln = lines.get(i);
            Matcher next = BQ_RE.matcher(ln.text());
            if (!next.find()) break;
            String segmentRaw = next.group(1);
            int segmentSourceBase = ln.startOffset() + ln.text().indexOf(segmentRaw);
            InlineResult stripped = Inline.stripInline(segmentRaw, segmentSourceBase);

            joinedTextOffset += 1; // newline separator
            for (InlineOffset entry : stripped.map()) {
                inlineMap.add(new InlineOffset(joinedTextOffset + entry.textOffset(), entry.sourceOffset()));
            }
            strippedSegments.add(stripped.text());
            joinedTextOffset += stripped.text().length();
            endOffset = ln.endOffset();
            i++;
        }
        Ast.Blockquote quote =
                new Ast.Blockquote(
                        String.join("\n", strippedSegments),
                        Span.spanFromOffsets(source, first.startOffset(), endOffset),
                        inlineMap);
        return new BlockquoteResult(quote, i);
    }

    private record ParagraphResult(Ast.Paragraph paragraph, int next) {}

    private static ParagraphResult consumeParagraph(String source, List<RawLine> lines, int startIdx) {
        RawLine first = lines.get(startIdx);
        int endIdx = startIdx;
        while (endIdx + 1 < lines.size()) {
            int candidateIdx = endIdx + 1;
            RawLine candidate = lines.get(candidateIdx);
            if (candidate.text().trim().isEmpty()) break;
            if (HEADING_PREFIX_RE.matcher(candidate.text()).find()) break;
            if (UL_RE.matcher(candidate.text()).find()) break;
            if (OL_RE.matcher(candidate.text()).find()) break;
            if (BQ_RE.matcher(candidate.text()).find()) break;
            if (FENCE_RE.matcher(candidate.text()).find()) break;
            if (ROW_RE.matcher(candidate.text()).find()) break;
            if (THEMATIC_RE.matcher(candidate.text()).find()) break;
            endIdx++;
        }
        RawLine last = lines.get(endIdx);
        int startOffset = first.startOffset();
        int endOffset = last.endOffset();
        String rawText = source.substring(startOffset, endOffset);
        InlineResult stripped = Inline.stripInline(rawText, startOffset);
        Ast.Paragraph paragraph =
                new Ast.Paragraph(
                        stripped.text(), Span.spanFromOffsets(source, startOffset, endOffset), stripped.map());
        return new ParagraphResult(paragraph, endIdx + 1);
    }

    private record FenceResult(Ast.Fence fence, int next) {}

    private static FenceResult tryFence(String source, List<RawLine> lines, int startIdx) {
        RawLine start = lines.get(startIdx);
        Matcher open = FENCE_RE.matcher(start.text());
        if (!open.find()) return null;
        String fenceMarker = open.group(1);
        String info = open.group(2).trim();

        int i = startIdx + 1;
        Integer bodyStart = null;
        Integer bodyEnd = null;
        int endOffset = start.endOffset();
        while (i < lines.size()) {
            RawLine ln = lines.get(i);
            Matcher close = FENCE_RE.matcher(ln.text());
            if (close.find() && close.group(1).length() >= fenceMarker.length()) {
                endOffset = ln.endOffset();
                break;
            }
            if (bodyStart == null) bodyStart = ln.startOffset();
            bodyEnd = ln.endOffset() + 1; // include the newline that separates from the next line
            i++;
        }
        // A trailing +1 on the last line's endOffset can overshoot source.length() when an
        // unclosed fence runs to end-of-input with no final newline. JS's String.slice clamps an
        // out-of-range end argument internally, so clamping here reproduces the same body TEXT JS
        // would produce (the full remaining tail, not an empty string). It does NOT reproduce JS's
        // bodySpan.endOffset/endCol for this case: JS's spanFromOffsets does not clamp its
        // endOffset argument, so JS's real (unclamped) span endpoint is an out-of-range value —
        // itself just an artifact of charCodeAt returning NaN for out-of-range access (never
        // equal to '\n', so the line/col loop increments once more), not a documented contract.
        // We deliberately don't chase that OOB quirk here: no conformance bundle exercises an
        // unclosed fence with no trailing newline, so this divergence has no observable effect
        // today, and replicating it would mean engineering a fragile OOB-quirk mechanism for a
        // bug nobody observes. Clamping avoids a StringIndexOutOfBoundsException; nothing more.
        int clampedBodyEnd = bodyEnd == null ? 0 : Math.min(bodyEnd, source.length());
        String body = (bodyStart != null && bodyEnd != null) ? source.substring(bodyStart, clampedBodyEnd) : "";
        int fallbackOffset = start.endOffset();
        Span bodySpan =
                Span.spanFromOffsets(
                        source,
                        bodyStart != null ? bodyStart : fallbackOffset,
                        bodyEnd != null ? clampedBodyEnd : fallbackOffset);
        Ast.Fence fenceBlock =
                new Ast.Fence(
                        Span.spanFromOffsets(source, start.startOffset(), endOffset), info, body, bodySpan);
        return new FenceResult(fenceBlock, i + 1);
    }

    private record TableResult(Ast.Table table, int next) {}

    private static TableResult tryTable(String source, List<RawLine> lines, int startIdx) {
        if (startIdx + 1 >= lines.size()) return null;
        RawLine headerLine = lines.get(startIdx);
        RawLine delimLine = lines.get(startIdx + 1);
        if (!ROW_RE.matcher(headerLine.text()).find()) return null;
        if (!DELIM_RE.matcher(delimLine.text()).find()) return null;

        RowCells headerParsed =
                TableCells.parseRowCells(headerLine.text(), headerLine.startOffset(), source);
        Row header =
                new Row(
                        headerParsed.cells(),
                        headerParsed.cellSpans(),
                        Span.spanFromOffsets(source, headerLine.startOffset(), headerLine.endOffset()));

        List<Row> rows = new ArrayList<>();
        int i = startIdx + 2;
        while (i < lines.size()) {
            RawLine ln = lines.get(i);
            if (!ROW_RE.matcher(ln.text()).find()) break;
            RowCells parsed = TableCells.parseRowCells(ln.text(), ln.startOffset(), source);
            rows.add(
                    new Row(
                            parsed.cells(),
                            parsed.cellSpans(),
                            Span.spanFromOffsets(source, ln.startOffset(), ln.endOffset())));
            i++;
        }
        Row lastRow = rows.isEmpty() ? null : rows.get(rows.size() - 1);
        int endOffset = lastRow != null ? lastRow.span().endOffset() : delimLine.endOffset();
        Ast.Table table =
                new Ast.Table(
                        Span.spanFromOffsets(source, headerLine.startOffset(), endOffset), header, rows);
        return new TableResult(table, i);
    }
}
