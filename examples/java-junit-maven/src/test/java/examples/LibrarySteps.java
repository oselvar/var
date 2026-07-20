package examples;

import dev.varar.State;
import dev.varar.StepDefinitions;
import dev.varar.Steps;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import java.util.stream.Stream;

public final class LibrarySteps implements StepDefinitions<LibrarySteps.Ctx> {

    record Ctx(List<Library.Loan> loans, Library.Money fee, boolean granted) implements State {}

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("MMMM d, yyyy", Locale.ENGLISH);

    private static Library.Money toMoney(String raw) {
        return raw.endsWith("p")
                ? Library.gbp(Double.parseDouble(raw.substring(0, raw.length() - 1)) / 100)
                : Library.gbp(Double.parseDouble(raw.substring(1)));
    }

    private static String formatMoney(Library.Money m) {
        return m.value() < 1 ? Math.round(m.value() * 100) + "p" : String.format(Locale.ROOT, "£%.2f", m.value());
    }

    @Override
    public void register(Steps<Ctx> s) {
        s.state(() -> new Ctx(List.of(), Library.gbp(0), false));

        s.param(
                "date",
                Pattern.compile("[A-Z][a-z]+ \\d{1,2}, \\d{4}"),
                groups -> LocalDate.parse(groups[0], DATE),
                DATE::format);
        s.param(
                "money",
                Pattern.compile("£(?=.*\\d.*)[-+]?\\d*(?:\\.(?=\\d.*))?\\d*|\\d+p"),
                groups -> toMoney(groups[0]),
                LibrarySteps::formatMoney);
        s.param(
                "title",
                Pattern.compile("\\*[^*]+\\*"),
                groups -> groups[0].substring(1, groups[0].length() - 1),
                title -> "*" + title + "*");

        s.stimulus(
                "borrowed {title}, due back on {date}",
                (Ctx ctx, String title, LocalDate due) -> new Ctx(
                        Stream.concat(ctx.loans().stream(), Stream.of(new Library.Loan(title, due)))
                                .toList(),
                        ctx.fee(),
                        ctx.granted()));

        s.stimulus(
                "returns it on {date}",
                (Ctx ctx, LocalDate returnedOn) -> new Ctx(
                        ctx.loans(),
                        ctx.loans().stream()
                                .map(loan -> Library.lateFee(loan, returnedOn))
                                .reduce(Library.gbp(0), Library::addMoney),
                        ctx.granted()));

        s.sensor("owes a {money} late fee", (Ctx ctx, Library.Money expected) -> ctx.fee());

        s.sensor("{money} for each day overdue", (Ctx ctx, Library.Money expected) -> Library.FEE_PER_DAY);

        s.stimulus(
                "asks to borrow {title} on {date}",
                (Ctx ctx, String title, LocalDate on) ->
                        new Ctx(ctx.loans(), ctx.fee(), Library.mayBorrow(ctx.loans(), on)));

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
