package com.oselvar.var.core;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.function.Function;

/**
 * The executor — port of {@code var-core/src/execute.ts}, adapted to Task 11's
 * full-replacement immutable-record state model.
 *
 * <h2>DeepFreeze decision (Task 18)</h2>
 *
 * <p>TS/Python port {@code deep-freeze.ts}/{@code deep_freeze.py}: a runtime guard that
 * recursively {@code Object.freeze}s the partially-merged plain-object state so a step
 * handler that tries to mutate it in place throws at runtime (see {@code
 * execute-state.test.ts}'s {@code "mutating the frozen state throws at runtime"}). That
 * guard exists only because TS/Python's state model is a plain mutable object/dict that
 * gets shallow-merged with each {@code context}/{@code action} return — mutation is
 * otherwise silently possible and needs to be defended against at runtime.
 *
 * <p><b>Java needs no equivalent and none is ported here.</b> Task 11 committed to a
 * full-replacement {@code record}-based state model ({@code com.oselvar.var.State}):
 * authors declare {@code record Ctx(...) implements State}, and every {@code
 * context}/{@code action} handler returns a brand new, complete {@code Ctx} value —
 * there is no partial merge and no in-place mutation path to guard against. A Java
 * {@code record} is immutable by construction (all fields {@code final}, no setters);
 * the only way to violate that is reflection, which is not a runtime concern this port
 * defends against (TS/Python don't defend against {@code unsafe}/native mutation either
 * — the guard is scoped to the ordinary, easy-to-reach mutation an author's own code
 * could otherwise perform, and Java's type system already forecloses that path). Adding
 * a {@code DeepFreeze.java} that recursively "freezes" already-immutable records would
 * be pure ceremony with nothing to protect against — see the design doc's own note that
 * records need "no deep-freeze runtime guard ... for the AST layer itself," which
 * applies equally to the state layer given Task 11's choice.
 *
 * <h2>Sensor return-comparison contract (this task's decision)</h2>
 *
 * <p>TS/Python: a sensor returns an array/tuple positionally aligned with every captured
 * inline argument, plus an optional trailing table/doc-string actual appended at the
 * end; the executor compares each position. Java's {@code Sensor0/1/2} (see {@code
 * com.oselvar.var.StateBinder}) return a single typed value {@code R} — there is no
 * tuple type in the committed author-facing API (confirmed against {@code
 * AuthorApiTest}'s roman-numerals fixture: {@code sensor("The result is {word}", (ctx,
 * expected) -> ctx.result())} returns a bare {@code String}, not a wrapped list). Task
 * 11/12 fixed the registration shape but left this return-to-comparison mapping
 * undecided; this executor resolves it as, in priority order:
 *
 * <ol>
 *   <li>a trailing data table is attached &rarr; {@code returned} IS the whole
 *       reproduced table, compared via {@link CellDiff#compareTable}.
 *   <li>a trailing doc string is attached &rarr; {@code returned} IS the doc string
 *       content, compared via {@link DocStringDiff#compareDocString}.
 *   <li>otherwise, if the step captured &ge;1 inline parameter &rarr; {@code returned}
 *       is compared against the LAST captured parameter. This is the convention the one
 *       committed example establishes for the 1-capture case, generalized to N&gt;1 by
 *       treating earlier captures as selector/input parameters (e.g. "the {word} shelf
 *       has {int} books" — {@code word} selects, {@code int} is asserted) — there is no
 *       multi-capture sensor anywhere in this port yet to confirm or refute this; see
 *       the Task 18 report's "concerns" section.
 *   <li>otherwise (no captures, no attachment) &rarr; nothing to compare; the sensor is
 *       observation-only.
 * </ol>
 *
 * <h2>Return-vs-throw parity (flagged by the Task 11 review, resolved here)</h2>
 *
 * <p>The above return-based comparison is one way a sensor can signal failure; the other
 * is throwing directly (e.g. an author's handler runs its own {@code
 * org.junit.jupiter.api.Assertions.assertEquals}/AssertJ/Hamcrest assertion instead of
 * returning a value for this executor to compare). Those throw {@code AssertionError} or
 * a subtype — which extends {@link Error}, not {@link RuntimeException}. This executor's
 * per-step boundary therefore catches {@link Throwable}, not just {@code
 * RuntimeException}: a narrower catch would give the two failure channels unequal
 * treatment — a returned mismatch gets stack injection/observer/error-fence handling, but
 * a thrown assertion would silently skip all three (escaping {@link #runExample}
 * unaugmented, unobserved, and un-inverted by an {@code error} fence). Catching {@code
 * Throwable} is also what {@code execute.ts}'s untyped {@code catch (err)} already does
 * (JS has no checked/unchecked distinction) — this is the Java-faithful equivalent, not a
 * looser translation.
 *
 * <p>{@code returned == null} always means "no assertion" (mirrors TS's {@code
 * undefined}), regardless of the above.
 *
 * <h2>Invoking an opaque handler</h2>
 *
 * <p>{@code var-core} has zero compile-time dependency on the {@code var} module's
 * author-facing {@code StateBinder.Context0/1/2}/{@code Sensor0/1/2} interfaces
 * (hexagonal architecture: the core never imports the facade) — {@link
 * Registry.StepRegistration#handler()} is plain {@link Object}. This executor invokes it
 * purely via reflection, matched by arity (state + captured args + at most one trailing
 * table/doc-string argument) against the handler's single non-{@code Object} method —
 * works for any functional interface shape, not just the ones {@code com.oselvar.var}
 * happens to define today.
 *
 * <h2>Stack injection for {@link Failure#toFailure}</h2>
 *
 * <p>Mirrors {@code execute.ts}'s {@code augmentStack}: when a step throws, a synthetic
 * {@link StackTraceElement} whose {@code fileName}/{@code lineNumber} are the {@code
 * .md} spec path/line is prepended to the thrown exception's stack trace via {@link
 * Throwable#setStackTrace}. {@link Failure#toFailure} (Task 17, unchanged) later reads
 * this back via its {@code failingLine} regex against the printed stack trace text —
 * this executor doesn't call {@code Failure.toFailure} itself; it just makes sure
 * whoever does (a later conformance/trace-projection task) finds the frame.
 */
public final class Execute {

    private Execute() {}

    // -----------------------------------------------------------------------------------------
    // Ports
    // -----------------------------------------------------------------------------------------

    /** Receives every diagnostic collected during planning, once per {@link #collectExamples}. */
    @FunctionalInterface
    public interface Reporter {
        void diagnostic(Diagnostics.Diagnostic diagnostic);
    }

    /** Per-step instrumentation (conformance trace mode); steps after a failure are not observed. */
    @FunctionalInterface
    public interface ExecutionObserver {
        void step(StepObservation observation);
    }

    /**
     * One executed step's outcome. {@code exampleIndex} is 0-based (position within
     * {@code plan.examples()}); {@code ordinal} is 1-based (position within the example).
     * {@code error} is {@code null} on a pass.
     */
    public record StepObservation(int exampleIndex, int ordinal, String outcome, Throwable error) {}

    /**
     * The ports {@link #collectExamples}/{@link #executePlan} need. {@code
     * createContext} maps a step-definition file to its fresh initial state (called once
     * per (example, file) pair, on demand); {@code null} defaults to a fresh {@code
     * Object} per file. {@code observer} is optional instrumentation; {@code null} means
     * "don't observe."
     *
     * <p>Unlike TS's {@code ExecutePorts}, there is no {@code sink}/{@code TestSink}
     * port here: {@code ports.ts} (which defines it) is out of scope for this sub-project
     * (see the design doc's module map), and Java doesn't need the callback-style
     * registration TS's {@code sink.example(name, run)} exists for — {@link
     * #collectExamples} returns the runnable examples directly as a plain {@code List}.
     */
    public record ExecutePorts(Reporter reporter, Function<String, Object> createContext, ExecutionObserver observer) {
        public ExecutePorts(Reporter reporter) {
            this(reporter, null, null);
        }
    }

    /** One runnable example: its name and a callback that runs its steps (throws on failure). */
    public record QueuedExample(String name, Runnable run) {}

    /** Thrown when an {@code error}-fenced (expected-to-fail) example runs without throwing. */
    public static final class UnexpectedPassException extends RuntimeException {
        public UnexpectedPassException() {
            super("expected the example to fail, but it passed");
        }
    }

    private static final Function<String, Object> DEFAULT_CONTEXT = file -> new Object();

    // -----------------------------------------------------------------------------------------
    // Public entry points
    // -----------------------------------------------------------------------------------------

    /**
     * Reports every diagnostic in {@code plan} via {@code ports.reporter()}, then returns
     * one {@link QueuedExample} per {@link Plan.PlannedExample}, in document order. Each
     * {@code run()} is lazy — nothing executes until called — mirroring {@code
     * execute.ts}'s {@code collectExamples} (a thin wrapper around {@code executePlan}
     * that queues rather than immediately runs).
     */
    public static List<QueuedExample> collectExamples(Plan.ExecutionPlan plan, ExecutePorts ports) {
        for (Diagnostics.Diagnostic d : plan.diagnostics()) {
            ports.reporter().diagnostic(d);
        }
        List<Plan.PlannedExample> examples = plan.examples();
        List<QueuedExample> queue = new ArrayList<>(examples.size());
        for (int i = 0; i < examples.size(); i++) {
            Plan.PlannedExample ex = examples.get(i);
            int exampleIndex = i;
            queue.add(new QueuedExample(ex.name(), () -> runExample(plan, ex, exampleIndex, ports)));
        }
        return List.copyOf(queue);
    }

    /**
     * Runs every example in {@code plan}, in order, stopping at (and propagating) the
     * first failure. A simple, synchronous "run everything now" driver — a caller that
     * wants per-example pass/fail control (e.g. one JUnit dynamic test per example)
     * should use {@link #collectExamples} instead and drive each {@link QueuedExample}
     * itself.
     */
    public static void executePlan(Plan.ExecutionPlan plan, ExecutePorts ports) {
        for (QueuedExample q : collectExamples(plan, ports)) {
            q.run().run();
        }
    }

    // -----------------------------------------------------------------------------------------
    // One example
    // -----------------------------------------------------------------------------------------

    private static void runExample(
            Plan.ExecutionPlan plan, Plan.PlannedExample ex, int exampleIndex, ExecutePorts ports) {
        Function<String, Object> createContext =
                ports.createContext() != null ? ports.createContext() : DEFAULT_CONTEXT;
        String path = plan.varDoc().path();
        String source = plan.varDoc().source();
        List<Plan.PlannedStep> steps = ex.steps();

        // Cache one state value per stepfile within this example. Lazy creation keeps the
        // cost zero for stepfiles whose steps don't run (e.g. after an earlier failure).
        Map<String, Object> stateByFile = new HashMap<>();
        Object lastReturn = null;
        Throwable thrown = null;

        for (int i = 0; i < steps.size(); i++) {
            Plan.PlannedStep step = steps.get(i);
            String file = step.stepDef().expressionSourceFile();
            Object state;
            if (stateByFile.containsKey(file)) {
                state = stateByFile.get(file);
            } else {
                state = resolve(createContext.apply(file));
                stateByFile.put(file, state);
            }

            // A trailing data table or doc string is passed as the LAST handler argument,
            // after whatever the cucumber expression captured.
            List<Object> extra = new ArrayList<>(1);
            if (step.dataTable() != null) {
                extra.add(tableRows(step.dataTable()));
            } else if (step.docString() != null) {
                extra.add(step.docString().body());
            }
            List<Object> callArgs = new ArrayList<>(step.args().size() + extra.size());
            callArgs.addAll(step.args());
            callArgs.addAll(extra);

            try {
                Object returned = resolve(invokeHandler(step.stepDef().handler(), state, callArgs));
                lastReturn = returned;
                // Dispatch on the step's role. context/action REPLACE state with the new,
                // complete value the handler returned (Task 11's full-replacement model —
                // no merge, no no-op case: the typed StateBinder.ContextN always returns a
                // full C). sensor compares its return against the Markdown; an unknown
                // (null) kind is a wiring bug.
                StepKind kind = step.stepDef().kind();
                if (kind == StepKind.CONTEXT || kind == StepKind.ACTION) {
                    stateByFile.put(file, returned);
                } else if (kind == StepKind.SENSOR) {
                    // Header-bound rows are compared after the loop via ex.rowChecks; skip
                    // the per-step contract for them (they return a row value instead).
                    if (ex.rowChecks() == null) {
                        checkSensorReturn(source, step, returned);
                    }
                } else {
                    throw new CellDiff.ReturnShapeException("unknown step kind: " + kind);
                }
                if (ports.observer() != null) {
                    ports.observer().step(new StepObservation(exampleIndex, i + 1, "pass", null));
                }
            } catch (Throwable err) {
                // Catches Throwable, not just RuntimeException — deliberate, see class
                // javadoc's "return-vs-throw parity" note: a sensor is free to signal
                // failure either by returning a mismatching value (compared above via
                // CellDiff/DocStringDiff/ParamDiff) or by throwing directly, including
                // assertion-style failures (`AssertionError` and its subtypes, e.g. a
                // JUnit/AssertJ/Hamcrest assertion an author's own handler code runs) —
                // `AssertionError` extends `Error`, not `RuntimeException`, so a narrower
                // catch would silently skip stack injection, the observer, and
                // error-fence inversion for that whole failure channel.
                Throwable augmented = augmentStack(err, step, path);
                if (ports.observer() != null) {
                    ports.observer().step(new StepObservation(exampleIndex, i + 1, "fail", augmented));
                }
                thrown = augmented;
                break;
            }
        }

        if (thrown == null && ex.rowChecks() != null && !ex.rowChecks().isEmpty()) {
            @SuppressWarnings("unchecked")
            List<CellDiff.RowCheck> checks = (List<CellDiff.RowCheck>) ex.rowChecks();
            List<CellDiff> bad = CellDiff.compareRow(lastReturn, checks).stream().filter(d -> !d.ok()).toList();
            if (!bad.isEmpty()) {
                Plan.PlannedStep lastStep = steps.get(steps.size() - 1);
                Throwable augmented = augmentStack(new CellDiff.CellMismatchException(bad), lastStep, path);
                if (ports.observer() != null) {
                    ports.observer().step(new StepObservation(exampleIndex, steps.size(), "fail", augmented));
                }
                thrown = augmented;
            }
        }

        if ("fail".equals(ex.expectedOutcome())) {
            if (thrown == null) {
                UnexpectedPassException e = new UnexpectedPassException();
                if (!steps.isEmpty()) {
                    throw sneakyThrow(augmentStack(e, steps.get(steps.size() - 1), path));
                }
                throw e;
            }
            if (ex.expectedErrorMessage() != null) {
                String msg = thrown.getMessage() != null ? thrown.getMessage() : String.valueOf(thrown);
                if (!msg.contains(ex.expectedErrorMessage())) {
                    throw sneakyThrow(thrown);
                }
            }
            return;
        }
        if (thrown != null) {
            throw sneakyThrow(thrown);
        }
    }

    /**
     * Rethrows any {@link Throwable} — including a checked exception, which none of this
     * class's own exception types or handler-invocation paths ever actually produce, but
     * which the compiler can't prove from a value merely typed {@code Throwable} — without
     * requiring a {@code throws} declaration on {@link Runnable#run()} (which permits none).
     * The classic "sneaky throw" idiom: generic erasure lets the cast to {@code T} succeed
     * at compile time while the JVM throws whatever {@code t} actually is at runtime.
     */
    @SuppressWarnings("unchecked")
    private static <T extends Throwable> RuntimeException sneakyThrow(Throwable t) throws T {
        throw (T) t;
    }

    // -----------------------------------------------------------------------------------------
    // Sensor return comparison (see class javadoc for the contract this implements)
    // -----------------------------------------------------------------------------------------

    private static void checkSensorReturn(String source, Plan.PlannedStep step, Object returned) {
        if (returned == null) return;
        if (step.dataTable() != null) {
            List<CellDiff> bad =
                    CellDiff.compareTable(returned, step.dataTable()).stream().filter(d -> !d.ok()).toList();
            if (!bad.isEmpty()) throw new CellDiff.CellMismatchException(bad);
            return;
        }
        if (step.docString() != null) {
            DocStringDiff diff =
                    DocStringDiff.compareDocString(returned, step.docString().body(), step.docString().bodySpan());
            if (diff != null) throw new DocStringDiff.DocStringMismatchException(diff);
            return;
        }
        if (!step.args().isEmpty()) {
            int lastIdx = step.args().size() - 1;
            Span paramSpan = step.paramSpans().get(lastIdx);
            String sourceText = source.substring(paramSpan.startOffset(), paramSpan.endOffset());
            List<CellDiff> diffs =
                    ParamDiff.compareParams(
                            List.of(returned),
                            List.of(step.args().get(lastIdx)),
                            List.of(paramSpan),
                            List.of(sourceText));
            List<CellDiff> bad = diffs.stream().filter(d -> !d.ok()).toList();
            if (!bad.isEmpty()) throw new CellDiff.CellMismatchException(bad);
        }
    }

    private static List<List<String>> tableRows(Ast.Table table) {
        List<List<String>> rows = new ArrayList<>(1 + table.rows().size());
        rows.add(List.copyOf(table.header().cells()));
        for (Ast.Row row : table.rows()) {
            rows.add(List.copyOf(row.cells()));
        }
        return List.copyOf(rows);
    }

    // -----------------------------------------------------------------------------------------
    // Handler invocation (reflection; see class javadoc)
    // -----------------------------------------------------------------------------------------

    private static Object invokeHandler(Object handler, Object state, List<Object> args) {
        Object[] callArgs = new Object[1 + args.size()];
        callArgs[0] = state;
        for (int i = 0; i < args.size(); i++) {
            callArgs[i + 1] = args.get(i);
        }
        Method sam = samMethod(handler.getClass(), callArgs.length);
        try {
            return sam.invoke(handler, callArgs);
        } catch (IllegalAccessException e) {
            throw new IllegalStateException("cannot invoke handler method " + sam, e);
        } catch (InvocationTargetException e) {
            throw rethrow(e.getCause() != null ? e.getCause() : e);
        }
    }

    /**
     * Finds {@code handlerClass}'s single abstract method with {@code paramCount}
     * parameters — the functional interface's SAM, whatever it's called and whichever
     * interface it belongs to (see class javadoc: {@code var-core} never imports {@code
     * com.oselvar.var}'s {@code Context0/1/2}/{@code Sensor0/1/2}).
     */
    private static Method samMethod(Class<?> handlerClass, int paramCount) {
        Method candidate = null;
        for (Method m : handlerClass.getMethods()) {
            if (m.getDeclaringClass() == Object.class) continue;
            if (Modifier.isStatic(m.getModifiers()) || m.isDefault()) continue;
            if (m.getParameterCount() != paramCount) continue;
            if (candidate == null || (candidate.isBridge() && !m.isBridge())) {
                candidate = m;
            }
        }
        if (candidate == null) {
            throw new IllegalStateException(
                    "no handler method with " + paramCount + " parameter(s) found on " + handlerClass);
        }
        candidate.setAccessible(true);
        return candidate;
    }

    // -----------------------------------------------------------------------------------------
    // Async (CompletableFuture) support
    // -----------------------------------------------------------------------------------------

    /**
     * Drives a {@link CompletableFuture} to completion if {@code value} is one; returns
     * anything else unchanged. Lets a handler (or {@code createContext}) be sync or
     * async without the caller needing to know which.
     */
    private static Object resolve(Object value) {
        if (value instanceof CompletableFuture<?> future) {
            try {
                return future.join();
            } catch (CompletionException e) {
                throw rethrow(e.getCause() != null ? e.getCause() : e);
            }
        }
        return value;
    }

    private static RuntimeException rethrow(Throwable cause) {
        if (cause instanceof RuntimeException re) return re;
        if (cause instanceof Error er) throw er;
        return new RuntimeException(cause);
    }

    // -----------------------------------------------------------------------------------------
    // Stack injection (see class javadoc)
    // -----------------------------------------------------------------------------------------

    /**
     * Prepends a synthetic {@link StackTraceElement} pointing at the matched step text's
     * location in the source {@code .md} to {@code err}'s stack trace, then returns
     * {@code err}. Port of {@code execute.ts}'s {@code augmentStack}, adapted to Java's
     * structured stack (see {@code Failure.java}'s javadoc): where TS splices a text line
     * into {@code error.stack}, this builds a real {@link StackTraceElement} whose {@code
     * fileName}/{@code lineNumber} are the {@code .md} path/line, so {@link
     * Failure#toFailure}'s regex (which reads the printed stack trace text) finds it.
     */
    private static Throwable augmentStack(Throwable err, Plan.PlannedStep step, String varPath) {
        String text = step.text();
        String label = text.length() > 60 ? text.substring(0, 60) + "…" : text;
        StackTraceElement synthetic = new StackTraceElement("Step", label, varPath, step.matchSpan().startLine());
        StackTraceElement[] original = err.getStackTrace();
        StackTraceElement[] augmented = new StackTraceElement[original.length + 1];
        augmented[0] = synthetic;
        System.arraycopy(original, 0, augmented, 1, original.length);
        err.setStackTrace(augmented);
        return err;
    }
}
