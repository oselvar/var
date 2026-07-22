package dev.varar.core;

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
 * <h2>No mutation guard, in any port</h2>
 *
 * <p>No port polices what an author does with their own state. Varar hands the value the
 * factory (or the previous {@code stimulus}) produced to the next handler untouched, and
 * that is the whole contract. TS/Python/Ruby once deep-froze the plain-object state so an
 * in-place mutation threw at runtime; that guard was removed as overreach. It never
 * enforced much — it descended plain objects/dicts/hashes only, leaving every class
 * instance live, so the invariant it claimed held for some of the state and not the rest.
 * It also froze values the author still held references to elsewhere, and its type-level
 * mirror recursed into class instances and stripped their private brands, so a state
 * holding a DB client stopped being assignable to its own declared type.
 *
 * <p>Java therefore needs no equivalent, and never had one: {@code dev.varar.State} is a
 * full-replacement {@code record} model. Authors declare {@code record Ctx(...) implements
 * State} and every {@code stimulus} returns a brand new, complete {@code Ctx}. A record is
 * immutable by construction (all fields {@code final}, no setters), so the language gives
 * for free what the dynamic ports now leave to the author's own type declaration.
 *
 * <h2>Sensor return-comparison contract (the shared slot model)</h2>
 *
 * <p>All ports share one contract. A sensor's comparison <em>slots</em> are its
 * expression's captured inline parameters, in order, followed by the trailing data
 * table or doc string, if any. The return value maps onto the slots by count:
 *
 * <ol>
 *   <li>zero slots &rarr; nothing to compare; returning a non-{@code null} value is a
 *       contract violation ({@link CellDiff.ReturnShapeException}) — throw to fail,
 *       return nothing to pass.
 *   <li>exactly one slot &rarr; {@code returned} IS that slot's value, bare: an inline
 *       parameter is compared via {@link ParamDiff#compareParams}, a table via {@link
 *       CellDiff#compareTable}, a doc string via {@link
 *       DocStringDiff#compareDocString}. A return value is never read as a positional
 *       list here, so a parameter type transforming to a {@code List} is compared
 *       as-is.
 *   <li>two or more slots &rarr; {@code returned} must be a {@link List} with exactly
 *       one element per slot; each position is compared against its slot.
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
 * author-facing {@code Steps.Stimulus0/1/2}/{@code Sensor0/1/2} interfaces
 * (hexagonal architecture: the core never imports the facade) — {@link
 * Registry.StepRegistration#handler()} is plain {@link Object}. This executor invokes it
 * purely via reflection, matched by arity (state + captured args + at most one trailing
 * table/doc-string argument) against the handler's single non-{@code Object} method —
 * works for any functional interface shape, not just the ones {@code dev.varar}
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
                // Dispatch on the step's role. A stimulus REPLACES state with the new,
                // complete value the handler returned — no merge: a return carrying
                // fewer fields shrinks the state. Returning nothing (null) leaves state
                // unchanged. sensor compares its return against the Markdown; an unknown
                // (null) kind is a wiring bug.
                StepKind kind = step.stepDef().kind();
                if (kind == StepKind.STIMULUS) {
                    // Returning nothing (null) leaves state unchanged; it does not wipe it.
                    if (returned != null) {
                        stateByFile.put(file, returned);
                    }
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
            List<CellDiff> bad = CellDiff.compareRow(lastReturn, checks).stream()
                    .filter(d -> !d.ok())
                    .toList();
            // Like a slotted sensor, a header-bound row step must answer the row it is bound
            // to: no return means nothing was compared.
            RuntimeException rowError = lastReturn == null
                    ? new CellDiff.ReturnShapeException(
                            "a header-bound row step must return a row object with one value per"
                                    + " bound cell, got nothing")
                    : null;
            if (rowError != null || !bad.isEmpty()) {
                Plan.PlannedStep lastStep = steps.get(steps.size() - 1);
                Throwable augmented = augmentStack(
                        rowError != null ? rowError : new CellDiff.CellMismatchException(bad), lastStep, path);
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
        int extraCount = (step.dataTable() != null || step.docString() != null) ? 1 : 0;
        int slotCount = step.args().size() + extraCount;
        if (slotCount == 0) {
            // Nothing to compare against: returning nothing is the pass, a value is a mistake.
            if (returned == null) return;
            throw new CellDiff.ReturnShapeException(
                    "this sensor has no parameters, data table or doc string — nothing to compare"
                            + " a return value against (throw to fail, return nothing to pass)");
        }
        // With one or more slots the return is REQUIRED: returning nothing used to skip the
        // comparison silently, so a typo in a field access turned an assertion into a no-op.
        if (returned == null) {
            throw new CellDiff.ReturnShapeException(
                    "a sensor with " + slotCount + " slot(s) must return one value per slot," + " got nothing");
        }
        List<Object> slots;
        if (slotCount == 1) {
            // The return IS the single slot's value — never read as a positional list,
            // so a parameter type transforming to a List is compared as-is.
            slots = List.of(returned);
        } else {
            if (!(returned instanceof List<?> list)) {
                throw new CellDiff.ReturnShapeException("a sensor with " + slotCount + " slots must return a List of "
                        + slotCount + " values, got "
                        + returned.getClass().getSimpleName());
            }
            if (list.size() != slotCount) {
                throw new CellDiff.ReturnShapeException(
                        "sensor return must have " + slotCount + " element(s), got " + list.size());
            }
            slots = new ArrayList<>(list);
        }
        int argCount = step.args().size();
        if (argCount > 0) {
            List<String> sourceTexts = step.paramSpans().stream()
                    .map(s -> source.substring(s.startOffset(), s.endOffset()))
                    .toList();
            List<CellDiff> diffs = ParamDiff.compareParams(
                    slots.subList(0, argCount), step.args(), step.paramSpans(), sourceTexts, step.formats());
            List<CellDiff> bad = diffs.stream().filter(d -> !d.ok()).toList();
            if (!bad.isEmpty()) throw new CellDiff.CellMismatchException(bad);
        }
        // Trailing table / doc string occupies the last slot.
        if (step.dataTable() != null) {
            List<CellDiff> bad = CellDiff.compareTable(slots.get(argCount), step.dataTable()).stream()
                    .filter(d -> !d.ok())
                    .toList();
            if (!bad.isEmpty()) throw new CellDiff.CellMismatchException(bad);
        } else if (step.docString() != null) {
            CellDiff diff = DocStringDiff.compareDocString(
                    slots.get(argCount),
                    step.docString().body(),
                    step.docString().bodySpan());
            if (diff != null) throw new CellDiff.CellMismatchException(java.util.List.of(diff));
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
     * dev.varar}'s {@code Context0/1/2}/{@code Sensor0/1/2}).
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
        // Editors resolve the failure's location from this frame; FailureAnchor decides where
        // it points, and the conformance trace pins that same rule across ports.
        Span anchor = FailureAnchor.anchor(err, step.matchSpan());
        StackTraceElement synthetic = new StackTraceElement("Step", label, varPath, anchor.startLine());
        StackTraceElement[] original = err.getStackTrace();
        StackTraceElement[] augmented = new StackTraceElement[original.length + 1];
        augmented[0] = synthetic;
        System.arraycopy(original, 0, augmented, 1, original.length);
        err.setStackTrace(augmented);
        return err;
    }
}
