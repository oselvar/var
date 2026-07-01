package com.oselvar.var.core;

import io.cucumber.cucumberexpressions.CucumberExpressionParser;
import io.cucumber.cucumberexpressions.Node;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Serializes {@link Ast} nodes into the plain {@code Map}/{@code List} wire-format
 * structures that {@link CanonicalJson#canonicalStringify(Object)} turns into the
 * conformance corpus's deterministic JSON artifacts.
 *
 * <p>Port of the var-doc and registry portions of {@code var-core/src/conformance.ts}'s
 * {@code toVarDocArtifact}/{@code toRegistryArtifact} (and the equivalent
 * {@code to_var_doc_artifact}/{@code to_registry_artifact} in the Python port). Field
 * names are camelCase and must match {@code conformance/bundles/*}/golden/*.json}
 * exactly; key ordering doesn't matter here ({@link LinkedHashMap} is used purely for
 * readability while debugging) because {@link CanonicalJson} recursively sorts keys
 * itself.
 *
 * <p>Trace projection is a later task (Milestone 4) — this class currently covers the
 * var-doc, registry, and plan projections.
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

    /**
     * Projects a {@link Registry} to the registry wire artifact: {@code {steps:
     * [{expression, parameterTypeNames}], parameterTypes: [{name, regexp}]}}.
     *
     * <p>Port of {@code toRegistryArtifact} in {@code conformance.ts} (and
     * {@code to_registry_artifact} in the Python port). No conformance bundle
     * currently exercises {@code defineParameterType} (every {@code golden/
     * registry.json}'s {@code parameterTypes} is {@code []} — see the plan's
     * deferred list), so unlike TS/Python this overload takes no explicit custom-
     * parameter-types argument; add one if/when a bundle needs it.
     */
    public static Map<String, Object> toRegistryArtifact(Registry registry) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("steps", registry.steps().stream().map(Conformance::step).toList());
        out.put("parameterTypes", List.of());
        return out;
    }

    /**
     * Projects an {@link Plan.ExecutionPlan} to the plan wire artifact: {@code {examples,
     * diagnostics}}. Port of {@code toPlanArtifact} in {@code conformance.ts}.
     *
     * <p>Per example: {@code name}, {@code scopeStack}, {@code span}, {@code expectedOutcome}
     * (defaults to {@code "pass"}), {@code expectedErrorMessage} (omitted when absent), {@code
     * steps}. Per step: {@code text}, {@code matchSpan}, {@code paramSpans}, {@code
     * matchedExpression}, {@code args} (one {@code {value, parameterType}} per param span — {@code
     * value} is a direct source substring at the param span's offsets, {@code parameterType} the
     * matched expression's parameter-type name at that position, {@code null} for a fixed-text
     * position), {@code dataTable}/{@code docString} (omitted when absent).
     *
     * <p>{@code docString}'s wire shape ({@code {content, contentType, span}}) is deliberately NOT
     * the body-block {@link Ast.Fence} shape ({@code {kind, span, info, body, bodySpan}}): {@code
     * content} = {@code fence.body()}, {@code contentType} = {@code fence.info()}, and — the
     * field-mapping trap confirmed against {@code conformance/bundles/04-tables-and-docstrings/
     * golden/plan.json} — {@code span} = {@code fence.bodySpan()} (the body-only range), NOT {@code
     * fence.span()} (the whole fence including the opening/closing {@code ```} delimiters). {@code
     * dataTable}'s wire shape, by contrast, IS identical to a body-block {@link Ast.Table} (checked
     * against {@code conformance/bundles/11-emoji-offsets/golden/plan.json}), so it reuses {@link
     * #table(Ast.Table)} directly.
     */
    public static Map<String, Object> toPlanArtifact(Plan.ExecutionPlan plan) {
        String source = plan.varDoc().source();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put(
                "examples",
                plan.examples().stream().map(ex -> plannedExample(source, ex)).toList());
        out.put("diagnostics", plan.diagnostics().stream().map(Conformance::diagnostic).toList());
        return out;
    }

    private static Map<String, Object> plannedExample(String source, Plan.PlannedExample ex) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("name", ex.name());
        out.put("scopeStack", List.copyOf(ex.scopeStack()));
        out.put("span", span(ex.span()));
        out.put("expectedOutcome", ex.expectedOutcome() != null ? ex.expectedOutcome() : "pass");
        if (ex.expectedErrorMessage() != null) {
            out.put("expectedErrorMessage", ex.expectedErrorMessage());
        }
        out.put("steps", ex.steps().stream().map(s -> plannedStep(source, s)).toList());
        return out;
    }

    private static Map<String, Object> plannedStep(String source, Plan.PlannedStep step) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("text", step.text());
        out.put("matchSpan", span(step.matchSpan()));
        out.put("paramSpans", step.paramSpans().stream().map(Conformance::span).toList());
        out.put("matchedExpression", step.stepDef().expression());

        List<String> paramNames = parameterTypeNames(step.stepDef().expression());
        List<Object> args = new ArrayList<>(step.paramSpans().size());
        for (int i = 0; i < step.paramSpans().size(); i++) {
            Span paramSpan = step.paramSpans().get(i);
            Map<String, Object> arg = new LinkedHashMap<>();
            arg.put("value", source.substring(paramSpan.startOffset(), paramSpan.endOffset()));
            arg.put("parameterType", i < paramNames.size() ? paramNames.get(i) : null);
            args.add(arg);
        }
        out.put("args", args);

        if (step.dataTable() != null) out.put("dataTable", table(step.dataTable()));
        if (step.docString() != null) out.put("docString", docString(step.docString()));
        return out;
    }

    /**
     * The {@code docString} attachment's wire shape ({@code {content, contentType, span}}) —
     * NOT the same as a body-block {@link Ast.Fence} (see {@link #toPlanArtifact}'s javadoc for
     * the field-mapping trap this deliberately avoids).
     */
    private static Map<String, Object> docString(Ast.Fence f) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("content", f.body());
        out.put("contentType", f.info());
        out.put("span", span(f.bodySpan()));
        return out;
    }

    private static Map<String, Object> diagnostic(Diagnostics.Diagnostic d) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("code", diagnosticCode(d.code()));
        out.put("severity", d.severity().name().toLowerCase(java.util.Locale.ROOT));
        out.put("span", span(d.span()));
        return out;
    }

    /** Maps the closed {@link Diagnostics.DiagnosticCode} enum to TS's kebab-case wire strings. */
    private static String diagnosticCode(Diagnostics.DiagnosticCode code) {
        return switch (code) {
            case AMBIGUOUS_MATCH -> "ambiguous-match";
            case ERROR_FENCE_WITHOUT_STEP -> "error-fence-without-step";
        };
    }

    private static Map<String, Object> step(Registry.StepRegistration s) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("expression", s.expression());
        out.put("parameterTypeNames", parameterTypeNames(s.expression()));
        return out;
    }

    /**
     * Parameter-type names in source order, read from the expression's parsed AST
     * (authoritative). A naive {@code {...}} regex miscounts on escaped braces
     * ({@code \{}/{@code \}}), which are literal text, not parameters. Cucumber
     * rejects parameters inside optionals/alternation, so they only appear at the
     * top level, but this recurses defensively, mirroring {@code conformance.ts}'s
     * {@code parameterTypeNames}.
     *
     * <p>Java's {@code CucumberExpression} (unlike the TS/Python libraries) does not
     * expose its parsed AST or parameter-type list publicly — confirmed via {@code
     * javap -p}, no {@code getAst()}/{@code getParameterTypes()} escape the class.
     * This re-parses {@code source} with the library's own public {@link
     * CucumberExpressionParser#parse(String)}, which is exactly what {@code
     * CucumberExpression}'s constructor does internally to build its regex —
     * reproducing an identical {@link Node} tree, empirically confirmed by dumping
     * it for an expression exercising nested parameters and an escaped brace (each
     * {@code PARAMETER_NODE} has exactly one {@code TEXT_NODE} child holding the
     * name, and {@code \{escaped\}} parses as a single literal {@code TEXT_NODE},
     * never a parameter). {@link Node#text()} recurses the same way internally but
     * is package-private; {@link #nodeText} reimplements it against the class's
     * public surface ({@link Node#token()}/{@link Node#nodes()}) instead of
     * reflecting into the library.
     */
    static List<String> parameterTypeNames(String source) {
        Node ast = new CucumberExpressionParser().parse(source);
        List<String> names = new ArrayList<>();
        collectParameterNames(ast, names);
        return names;
    }

    private static void collectParameterNames(Node node, List<String> names) {
        if (node.type() == Node.Type.PARAMETER_NODE) {
            names.add(nodeText(node));
            return;
        }
        List<Node> children = node.nodes();
        if (children != null) {
            for (Node child : children) collectParameterNames(child, names);
        }
    }

    /** Reimplements {@code Node#text()} (package-private in the library) publicly. */
    private static String nodeText(Node node) {
        String token = node.token();
        if (token != null) return token;
        StringBuilder sb = new StringBuilder();
        List<Node> children = node.nodes();
        if (children != null) {
            for (Node child : children) sb.append(nodeText(child));
        }
        return sb.toString();
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
