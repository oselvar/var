package com.oselvar.var.core;

import io.cucumber.cucumberexpressions.CucumberExpressionParser;
import io.cucumber.cucumberexpressions.Node;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

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
 * <p>This class covers all four conformance projections: var-doc, registry, plan (Tasks
 * 10/13/16), and — added here — the trace projection ({@link #toFailureArtifact}/{@link
 * #runConformance}, Task 19), closing the loop so every bundle can be checked against
 * all four goldens ({@code var-doc.json}, {@code registry.json}, {@code plan.json},
 * {@code trace.json}) byte-for-byte.
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

    /**
     * The typed return of {@link #runConformance}: all four projected wire artifacts for one
     * bundle. Java has no reason to repeat the untyped-{@code Map}-per-stage pattern the way
     * Python's {@code run_conformance} initially did (and later had to retrofit a {@code
     * BundleArtifacts} dataclass onto) — a typed record costs nothing extra here and is
     * available from the start.
     */
    public record BundleArtifacts(
            Map<String, Object> varDoc,
            Map<String, Object> registry,
            Map<String, Object> plan,
            Map<String, Object> trace) {}

    /**
     * Projects a caught step exception to the {@code FailureArtifact} wire shape — port of
     * {@code toFailureArtifact} in {@code conformance.ts}. {@code line} is the failing step's
     * own 1-based {@code matchSpan.startLine} in the {@code .md} — a deterministic,
     * language-agnostic source position (never scraped from a stack trace), so every port
     * reproduces it identically.
     *
     * <p>Dispatch order mirrors {@code conformance.ts} exactly: {@link
     * CellDiff.CellMismatchException} (filtered to only the failing cells) &rarr; {@link
     * DocStringDiff.DocStringMismatchException} &rarr; {@link CellDiff.ReturnShapeException}
     * &rarr; {@link Execute.UnexpectedPassException} &rarr; anything else falls through to
     * {@code "thrown"}, which — confirmed against real goldens ({@code
     * conformance/bundles/03-expected-failure/golden/trace.json} and {@code
     * 09-expected-message-mismatch/golden/trace.json}) — carries no extra fields beyond
     * {@code kind}/{@code line}; TS's own fallback ({@code return { kind: 'thrown', line }})
     * likewise never adds the error's message/stack to the wire artifact.
     */
    public static Map<String, Object> toFailureArtifact(Throwable error, int line) {
        if (CellDiff.isCellMismatchException(error)) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("kind", "cell-mismatch");
            out.put("line", line);
            List<Object> cells = new ArrayList<>();
            for (CellDiff c : ((CellDiff.CellMismatchException) error).cells()) {
                if (!c.ok()) cells.add(failureCell(c));
            }
            out.put("cells", cells);
            return out;
        }
        if (DocStringDiff.isDocStringMismatchException(error)) {
            DocStringDiff diff = ((DocStringDiff.DocStringMismatchException) error).diff();
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("kind", "doc-string-mismatch");
            out.put("line", line);
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("expected", diff.expected());
            d.put("actual", diff.actual());
            d.put("span", span(diff.span()));
            out.put("diff", d);
            return out;
        }
        if (error instanceof CellDiff.ReturnShapeException) return kindLine("return-shape", line);
        if (error instanceof Execute.UnexpectedPassException) return kindLine("unexpected-pass", line);
        return kindLine("thrown", line);
    }

    private static Map<String, Object> failureCell(CellDiff c) {
        Map<String, Object> cell = new LinkedHashMap<>();
        cell.put("column", c.column());
        cell.put("expected", c.expected());
        cell.put("actual", c.actual());
        cell.put("span", span(c.span()));
        return cell;
    }

    private static Map<String, Object> kindLine(String kind, int line) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("kind", kind);
        out.put("line", line);
        return out;
    }

    /**
     * The top-level conformance orchestration for one bundle — port of {@code runConformance}
     * in {@code conformance.ts}. Builds the plan ({@link Plan#plan}), runs it ({@link
     * Execute#collectExamples}) while recording every {@link Execute.StepObservation} via an
     * {@link Execute.ExecutionObserver}, then projects all four wire artifacts into one {@link
     * BundleArtifacts}.
     *
     * <p><b>{@code contextFactory} is a single {@link Supplier}</b>, not (as in TS/Python) a
     * function keyed by step file: every Java conformance fixture registers exactly one state
     * type via a single {@code defineState} call (see {@code RegistryRegistrar}), so there is
     * never more than one context factory to dispatch to. {@link Execute.ExecutePorts} still
     * declares {@code createContext} as a {@code Function<String, Object>} keyed by step file
     * (that port is unaware of this simplification — it's shared with any future non-conformance
     * caller that might need per-file contexts) — this method just wraps {@code contextFactory}
     * in a function that ignores its argument.
     *
     * <p>{@code contextFactory} is typed {@code Supplier<?>}, not {@code
     * Supplier<com.oselvar.var.State>}: this package ({@code var-core}) has zero compile-time
     * dependency on the {@code var} facade's {@code State} marker interface — the same
     * hexagonal boundary {@link Execute}'s own {@code createContext} port already respects by
     * returning plain {@code Object}.
     *
     * <p>Per-step outcome selection mirrors {@code conformance.ts} exactly: among the
     * observations recorded for a step's ordinal, prefer the first {@code "fail"}; otherwise
     * fall back to the last observation; a step with no observation at all (never reached,
     * because an earlier step in the same example already failed) is {@code "skipped"}. An
     * example's own top-level {@code outcome} is {@code "fail"} iff running it threw (including
     * the expected-failure inversion {@link Execute} already performs — a passing {@code error}-
     * fenced example does NOT throw, so its top-level outcome is {@code "pass"} even though one
     * of its steps is individually traced as {@code "fail"}; see {@code
     * conformance/bundles/03-expected-failure/golden/trace.json}).
     */
    public static BundleArtifacts runConformance(Ast.VarDoc doc, Registry registry, Supplier<?> contextFactory) {
        Plan.ExecutionPlan execution = Plan.plan(doc, registry);

        Map<Integer, List<Execute.StepObservation>> observed = new HashMap<>();
        Execute.ExecutePorts ports =
                new Execute.ExecutePorts(
                        diagnostic -> {}, // diagnostics are already captured in the plan artifact
                        file -> contextFactory.get(),
                        observation ->
                                observed
                                        .computeIfAbsent(observation.exampleIndex(), k -> new ArrayList<>())
                                        .add(observation));

        List<Execute.QueuedExample> queue = Execute.collectExamples(execution, ports);

        List<Object> traceExamples = new ArrayList<>(queue.size());
        for (int k = 0; k < queue.size(); k++) {
            Execute.QueuedExample queued = queue.get(k);
            String outcome = "pass";
            try {
                queued.run().run();
            } catch (Throwable t) {
                outcome = "fail";
            }

            Plan.PlannedExample planned = execution.examples().get(k);
            List<Execute.StepObservation> obs = observed.getOrDefault(k, List.of());

            List<Object> steps = new ArrayList<>(planned.steps().size());
            for (int i = 0; i < planned.steps().size(); i++) {
                Plan.PlannedStep step = planned.steps().get(i);
                int ordinal = i + 1;

                // Prefer the first "fail" observation for this ordinal; else the last
                // observation seen; else null (never observed -> "skipped").
                Execute.StepObservation chosen = null;
                for (Execute.StepObservation o : obs) {
                    if (o.ordinal() != ordinal) continue;
                    chosen = o;
                    if ("fail".equals(o.outcome())) break;
                }
                String stepOutcome = chosen != null ? chosen.outcome() : "skipped";

                Map<String, Object> contextKey = new LinkedHashMap<>();
                contextKey.put("exampleName", queued.name());
                contextKey.put("stepFile", fileStem(step.stepDef().expressionSourceFile()));

                Map<String, Object> stepTrace = new LinkedHashMap<>();
                stepTrace.put("exampleName", queued.name());
                stepTrace.put("ordinal", ordinal);
                stepTrace.put("stepText", step.text());
                stepTrace.put("matchedExpression", step.stepDef().expression());
                stepTrace.put("contextKey", contextKey);
                stepTrace.put("outcome", stepOutcome);
                if ("fail".equals(stepOutcome)) {
                    stepTrace.put(
                            "failure",
                            toFailureArtifact(
                                    chosen != null ? chosen.error() : null, step.matchSpan().startLine()));
                }
                steps.add(stepTrace);
            }

            Map<String, Object> exampleTrace = new LinkedHashMap<>();
            exampleTrace.put("name", queued.name());
            exampleTrace.put("outcome", outcome);
            exampleTrace.put("steps", steps);
            traceExamples.add(exampleTrace);
        }

        Map<String, Object> trace = new LinkedHashMap<>();
        trace.put("examples", traceExamples);

        return new BundleArtifacts(
                toVarDocArtifact(doc), toRegistryArtifact(registry), toPlanArtifact(execution), trace);
    }

    /**
     * Recovers the cross-language-shared step-file "stem" (e.g. {@code "numerals.steps"}) used
     * for {@code contextKey.stepFile} in the trace artifact. TS/Python's {@code fileStem} strips
     * only the file's last extension — their step files are literally named {@code
     * numerals.steps.ts}/{@code numerals.steps.py}, so stripping just {@code .ts}/{@code .py}
     * already leaves the shared {@code numerals.steps} stem. Java's step-file naming convention
     * (Task 13's report) is structurally different — {@code <Stem>Steps.java} (PascalCase, e.g.
     * {@code NumeralsSteps.java}), not {@code numerals.steps.java} — so reproducing the exact same
     * shared stem the golden files were generated from (the goldens are ONE corpus, shared across
     * every language's fixture for a given bundle — see the {@code adding-a-language-port} skill's
     * "Step-def files referenced by stem" rule) needs the inverse of the Java convention: strip
     * the {@code .java} extension, strip a trailing {@code Steps} suffix if present, decapitalize
     * the remaining leading letter, and re-append the shared {@code .steps} suffix. Confirmed
     * against Task 13's own per-bundle stem table (e.g. {@code NumeralsSteps.java} &rarr; {@code
     * numerals.steps}, {@code CounterSteps.java} &rarr; {@code counter.steps}, ...,{@code
     * BoomSteps.java} &rarr; {@code boom.steps}). Falls back to plain extension-stripping
     * (matching TS/Python's rule) for any file that doesn't follow the {@code <Stem>Steps.java}
     * convention.
     */
    private static String fileStem(String path) {
        int slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
        String base = slash >= 0 ? path.substring(slash + 1) : path;
        int dot = base.lastIndexOf('.');
        String noExt = dot > 0 ? base.substring(0, dot) : base;
        if (noExt.length() > "Steps".length() && noExt.endsWith("Steps")) {
            String stem = noExt.substring(0, noExt.length() - "Steps".length());
            return Character.toLowerCase(stem.charAt(0)) + stem.substring(1) + ".steps";
        }
        return noExt;
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
