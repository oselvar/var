package com.oselvar.var.core;

import io.cucumber.cucumberexpressions.Argument;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Matches a sentence against a {@link Registry}'s compiled step expressions — port of {@code
 * var-core/src/matcher.ts}.
 *
 * <p><b>UTF-16 offset verification (confirmed, not assumed):</b> unlike the Python port ({@code
 * var_core/matcher.py}), which must convert every {@code cucumber-expressions}/{@code re} group
 * offset from Unicode code points to UTF-16 via {@code to_utf16_offset}, this port needs no such
 * conversion layer. Two independent lines of evidence:
 *
 * <ol>
 *   <li><b>Static:</b> decompiling {@code cucumber-expressions-20.0.0.jar} (via {@code javap -p
 *       -c}) shows {@code GroupBuilder.build} constructs every {@link
 *       io.cucumber.cucumberexpressions.Group} directly from {@code
 *       java.util.regex.Matcher.start(int)}/{@code .end(int)} — the JDK's own regex engine,
 *       which already operates on {@code char}-indexed (UTF-16 code-unit) offsets, exactly like
 *       every other module in this port (see {@link Span}'s javadoc). There is no intermediate
 *       code-point re-indexing anywhere in the library's matching path.
 *   <li><b>Empirical:</b> {@code MatcherTest
 *       .paramSpansUseUtf16OffsetsAcrossAnAstralCharacterNoManualConversionNeeded} places an
 *       astral character (a surrogate pair — 2 {@code char}s, 1 Unicode code point) before a
 *       captured {@code {string}} parameter and asserts the returned {@code paramSpans} against
 *       offsets computed purely with {@code String#indexOf}/{@code String#length} (UTF-16-native
 *       in Java). The test passes with zero conversion code, confirming the static finding above.
 * </ol>
 *
 * <p><b>Unanchored substring scan:</b> {@code cucumber-expressions} always anchors its generated
 * regex ({@code ^...$} — confirmed via {@code javap -c} on {@code CucumberExpression.getRegexp}),
 * and {@code Expression.match(String, Type...)} requires the *entire* input to match (it calls
 * {@code Matcher.matches()}, not {@code .find()}, per the decompiled {@code TreeRegexp.match}).
 * Neither is directly usable for substring scanning, so — mirroring {@code
 * cloneRegexpWithGlobal} in matcher.ts, which strips the anchors and recompiles with the {@code
 * g} flag — this strips the leading {@code ^}/trailing {@code $} from {@link
 * io.cucumber.cucumberexpressions.Expression#getRegexp()}'s source, recompiles it as a plain
 * {@link Pattern}, and scans the sentence with {@link java.util.regex.Matcher#find()} in a loop.
 * Each match region is then re-submitted to the step's own {@code Expression.match(String)} to
 * get typed argument values and per-parameter group spans, exactly as matcher.ts does with {@code
 * step.compiled.match(m[0])}. (Java's no-arg {@code Matcher.find()} already advances past
 * zero-length matches on its own — no {@code lastIndex++} workaround needed, unlike the JS port.)
 */
public final class Matcher {

    private Matcher() {}

    /** UTF-16 {@code start}/{@code end} of one captured parameter within the sentence. */
    public record ParamSpan(int start, int end) {}

    /** One successful expression match inside a sentence. */
    public record Hit(
            String expression,
            Registry.StepRegistration stepDef,
            int matchStart,
            int matchEnd,
            List<Object> args,
            List<ParamSpan> paramSpans) {
        public Hit {
            args = List.copyOf(args);
            paramSpans = List.copyOf(paramSpans);
        }
    }

    /** Two or more hits that start at the same position and have equal length. */
    public record AmbiguityCollision(int matchStart, int matchEnd, List<Hit> candidates) {
        public AmbiguityCollision {
            candidates = List.copyOf(candidates);
        }
    }

    /**
     * Tagged result of {@link #resolveHits}, mirroring matcher.ts's {@code ResolvedSteps} union:
     * either the greedy non-overlapping selection ({@link Ok}) or the ambiguity groups that
     * blocked selection ({@link Ambiguous}).
     */
    public sealed interface ResolvedSteps permits Ok, Ambiguous {}

    /** {@code hits} is the greedy, left-to-right, non-overlapping selection. */
    public record Ok(List<Hit> steps) implements ResolvedSteps {
        public Ok {
            steps = List.copyOf(steps);
        }
    }

    /** {@code collisions} lists every same-start/same-length tie that made the match ambiguous. */
    public record Ambiguous(List<AmbiguityCollision> collisions) implements ResolvedSteps {
        public Ambiguous {
            collisions = List.copyOf(collisions);
        }
    }

    /**
     * Returns every expression match found anywhere in {@code sentence} — one un-anchored
     * substring scan per registered step, in registration order. Mirrors {@code findHits} in
     * matcher.ts exactly.
     */
    public static List<Hit> findHits(String sentence, Registry registry) {
        List<Hit> hits = new ArrayList<>();
        for (Registry.StepRegistration step : registry.steps()) {
            Pattern unanchored = stripAnchors(step.compiled().getRegexp());
            java.util.regex.Matcher scan = unanchored.matcher(sentence);
            while (scan.find()) {
                String matchedText = scan.group();
                Optional<List<Argument<?>>> matched = step.compiled().match(matchedText);
                List<Argument<?>> arguments = matched.orElseGet(List::of);

                List<Object> args = new ArrayList<>(arguments.size());
                List<ParamSpan> paramSpans = new ArrayList<>();
                for (Argument<?> arg : arguments) {
                    args.add(arg.getValue());
                    int start = arg.getGroup().getStart();
                    int end = arg.getGroup().getEnd();
                    if (start >= 0 && end >= 0) {
                        paramSpans.add(new ParamSpan(scan.start() + start, scan.start() + end));
                    }
                }

                hits.add(
                        new Hit(
                                step.expression(),
                                step,
                                scan.start(),
                                scan.start() + matchedText.length(),
                                args,
                                paramSpans));
            }
        }
        return List.copyOf(hits);
    }

    /**
     * Strips the compiled expression's {@code ^...$} anchors and recompiles with the same flags,
     * so {@link java.util.regex.Matcher#find()} can locate the expression anywhere in the
     * sentence rather than requiring a whole-string match.
     */
    private static Pattern stripAnchors(Pattern anchored) {
        String source = anchored.pattern();
        if (source.startsWith("^")) source = source.substring(1);
        if (source.endsWith("$")) source = source.substring(0, source.length() - 1);
        return Pattern.compile(source, anchored.flags());
    }

    /**
     * Selects the greedy, left-to-right, non-overlapping subset of {@code hits}, or reports every
     * same-start/same-length ambiguity that prevents selection. Mirrors {@code resolveHits} in
     * matcher.ts exactly: sort by {@code matchStart} ascending then by length descending, group
     * consecutive same-start/same-length hits as a collision, and — only if there are no
     * collisions — greedily walk the sorted hits left to right, skipping any hit that starts
     * before the previous selection's end.
     */
    public static ResolvedSteps resolveHits(List<Hit> hits) {
        if (hits.isEmpty()) return new Ok(List.of());

        List<Hit> sorted = new ArrayList<>(hits);
        sorted.sort(
                (a, b) -> {
                    if (a.matchStart() != b.matchStart()) return a.matchStart() - b.matchStart();
                    return (b.matchEnd() - b.matchStart()) - (a.matchEnd() - a.matchStart());
                });

        List<AmbiguityCollision> collisions = new ArrayList<>();
        int i = 0;
        while (i < sorted.size()) {
            Hit here = sorted.get(i);
            int hereLen = here.matchEnd() - here.matchStart();
            List<Hit> tied = new ArrayList<>();
            tied.add(here);
            int j = i + 1;
            while (j < sorted.size()) {
                Hit candidate = sorted.get(j);
                if (candidate.matchStart() == here.matchStart()
                        && candidate.matchEnd() - candidate.matchStart() == hereLen) {
                    tied.add(candidate);
                    j++;
                } else {
                    break;
                }
            }
            if (tied.size() > 1) {
                collisions.add(new AmbiguityCollision(here.matchStart(), here.matchEnd(), tied));
            }
            i = j;
        }
        if (!collisions.isEmpty()) return new Ambiguous(collisions);

        List<Hit> steps = new ArrayList<>();
        int cursor = -1;
        for (Hit hit : sorted) {
            if (hit.matchStart() < cursor) continue;
            steps.add(hit);
            cursor = hit.matchEnd();
        }
        return new Ok(steps);
    }
}
