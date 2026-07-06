package examples;

import com.oselvar.var.Registrar;
import com.oselvar.var.State;
import com.oselvar.var.StateBinder;
import com.oselvar.var.StepDefinitions;
import java.time.LocalDate;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Stream;

public final class LibrarySteps implements StepDefinitions {

    record Ctx(List<Library.Loan> loans, int feePence, boolean granted) implements State {}

    private static final List<String> MONTHS = List.of(
            "January",
            "February",
            "March",
            "April",
            "May",
            "June",
            "July",
            "August",
            "September",
            "October",
            "November",
            "December");

    /** June 6th → LocalDate 2026-06-06 (the spec's year is 2026). */
    private static LocalDate toDate(String raw) {
        String[] parts = raw.split(" ");
        int day = Integer.parseInt(parts[1].substring(0, parts[1].length() - 2));
        return LocalDate.of(2026, MONTHS.indexOf(parts[0]) + 1, day);
    }

    /** £2.50 and 50p, both as pence. */
    private static int toPence(String raw) {
        return raw.startsWith("£")
                ? (int) Math.round(Double.parseDouble(raw.substring(1)) * 100)
                : Integer.parseInt(raw.substring(0, raw.length() - 1));
    }

    @Override
    public void defineSteps(Registrar registrar) {
        registrar.defineParameterType(
                "date",
                Pattern.compile("(?:January|February|March|April|May|June"
                        + "|July|August|September|October|November|December)"
                        + " \\d{1,2}(?:st|nd|rd|th)"),
                groups -> toDate(groups[0]));
        registrar.defineParameterType(
                "money", Pattern.compile("£\\d+(?:\\.\\d{2})?|\\d+p"), groups -> toPence(groups[0]));
        // Emphasis (*Emma*) is stripped before matching, so a title is a
        // Title Case run in the plain prose.
        registrar.defineParameterType("title", Pattern.compile("[A-Z][a-z]+(?: [A-Z][a-z]+)*"), groups -> groups[0]);

        StateBinder<Ctx> s = registrar.defineState(() -> new Ctx(List.of(), 0, false));

        s.stimulus(
                "borrowed {title}, due back on {date}",
                (Ctx ctx, String title, LocalDate due) -> new Ctx(
                        Stream.concat(ctx.loans().stream(), Stream.of(new Library.Loan(title, due)))
                                .toList(),
                        ctx.feePence(),
                        ctx.granted()));

        s.stimulus(
                "returns it on {date}",
                (Ctx ctx, LocalDate returnedOn) -> new Ctx(
                        ctx.loans(),
                        ctx.loans().stream()
                                .mapToInt(loan -> Library.lateFee(loan, returnedOn))
                                .sum(),
                        ctx.granted()));

        s.sensor("owes a {money} late fee", (Ctx ctx, Integer expected) -> ctx.feePence());

        s.sensor("{money} for each day overdue", (Ctx ctx, Integer expected) -> Library.FEE_PENCE_PER_DAY);

        s.stimulus(
                "asks to borrow {title} on {date}",
                (Ctx ctx, String title, LocalDate on) ->
                        new Ctx(ctx.loans(), ctx.feePence(), Library.mayBorrow(ctx.loans(), on)));

        s.sensor("the library refuses", (Ctx ctx) -> {
            if (ctx.granted()) throw new AssertionError("expected the library to refuse");
            return null;
        });

        s.sensor("the library agrees", (Ctx ctx) -> {
            if (!ctx.granted()) throw new AssertionError("expected the library to agree");
            return null;
        });
    }
}
