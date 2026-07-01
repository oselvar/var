package com.oselvar.var.core;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Serializes {@link Ast} nodes into the plain {@code Map}/{@code List} wire-format
 * structures that {@link CanonicalJson#canonicalStringify(Object)} turns into the
 * conformance corpus's deterministic JSON artifacts.
 *
 * <p>Port of the var-doc portion of {@code var-core/src/conformance.ts}'s
 * {@code toVarDocArtifact} (and the equivalent {@code to_var_doc_artifact} in the
 * Python port). Field names are camelCase and must match
 * {@code conformance/bundles/*}/golden/var-doc.json} exactly; key ordering doesn't
 * matter here ({@link LinkedHashMap} is used purely for readability while
 * debugging) because {@link CanonicalJson} recursively sorts keys itself.
 *
 * <p>Registry/plan/trace projections are later tasks (Milestones 2-4) — this class
 * currently covers only the var-doc projection.
 */
public final class Conformance {

    private Conformance() {}

    /**
     * Projects a parsed {@link Ast.VarDoc} to the var-doc wire artifact: {@code
     * {path, examples, orphanAttachments}}.
     */
    public static Map<String, Object> toVarDocArtifact(Ast.VarDoc doc) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("path", doc.path());
        out.put("examples", doc.examples().stream().map(Conformance::example).toList());
        out.put(
                "orphanAttachments",
                doc.orphanAttachments().stream().map(Conformance::tableOrFence).toList());
        return out;
    }

    /** Dispatches on the sealed {@link Ast.TableOrFence} union (the orphan-attachment type). */
    private static Map<String, Object> tableOrFence(Ast.TableOrFence tableOrFence) {
        return switch (tableOrFence) {
            case Ast.Table t -> table(t);
            case Ast.Fence f -> fence(f);
        };
    }

    private static Map<String, Object> example(Ast.Example example) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("scopeStack", List.copyOf(example.scopeStack()));
        out.put("span", span(example.span()));
        out.put("body", example.body().stream().map(Conformance::block).toList());
        return out;
    }

    /** Dispatches on the sealed {@link Ast.Block} union — exhaustive, no default branch. */
    private static Map<String, Object> block(Ast.Block block) {
        return switch (block) {
            case Ast.Heading h -> heading(h);
            case Ast.Paragraph p -> paragraph(p);
            case Ast.ListItem l -> listItem(l);
            case Ast.Blockquote b -> blockquote(b);
            case Ast.Table t -> table(t);
            case Ast.Fence f -> fence(f);
            case Ast.ThematicBreak t -> thematicBreak(t);
        };
    }

    private static Map<String, Object> heading(Ast.Heading h) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("kind", "heading");
        out.put("level", h.level());
        out.put("text", h.text());
        out.put("span", span(h.span()));
        return out;
    }

    private static Map<String, Object> paragraph(Ast.Paragraph p) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("kind", "paragraph");
        out.put("text", p.text());
        out.put("span", span(p.span()));
        out.put("inlineMap", inlineMap(p.inlineMap()));
        return out;
    }

    private static Map<String, Object> listItem(Ast.ListItem l) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("kind", "list_item");
        out.put("text", l.text());
        out.put("span", span(l.span()));
        out.put("inlineMap", inlineMap(l.inlineMap()));
        out.put("ordered", l.ordered());
        out.put("markerSpan", span(l.markerSpan()));
        return out;
    }

    private static Map<String, Object> blockquote(Ast.Blockquote b) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("kind", "blockquote");
        out.put("text", b.text());
        out.put("span", span(b.span()));
        out.put("inlineMap", inlineMap(b.inlineMap()));
        return out;
    }

    private static Map<String, Object> table(Ast.Table t) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("kind", "table");
        out.put("span", span(t.span()));
        out.put("header", row(t.header()));
        out.put("rows", t.rows().stream().map(Conformance::row).toList());
        return out;
    }

    private static Map<String, Object> row(Ast.Row r) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cells", List.copyOf(r.cells()));
        out.put("cellSpans", r.cellSpans().stream().map(Conformance::span).toList());
        out.put("span", span(r.span()));
        return out;
    }

    private static Map<String, Object> fence(Ast.Fence f) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("kind", "fence");
        out.put("span", span(f.span()));
        out.put("info", f.info());
        out.put("body", f.body());
        out.put("bodySpan", span(f.bodySpan()));
        return out;
    }

    private static Map<String, Object> thematicBreak(Ast.ThematicBreak t) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("kind", "thematic_break");
        out.put("span", span(t.span()));
        return out;
    }

    private static List<Object> inlineMap(List<Ast.InlineOffset> inlineMap) {
        return inlineMap.stream().<Object>map(Conformance::inlineOffset).toList();
    }

    private static Map<String, Object> inlineOffset(Ast.InlineOffset o) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("textOffset", o.textOffset());
        out.put("sourceOffset", o.sourceOffset());
        return out;
    }

    private static Map<String, Object> span(Span s) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("startOffset", s.startOffset());
        out.put("endOffset", s.endOffset());
        out.put("startLine", s.startLine());
        out.put("startCol", s.startCol());
        out.put("endLine", s.endLine());
        out.put("endCol", s.endCol());
        return out;
    }
}
