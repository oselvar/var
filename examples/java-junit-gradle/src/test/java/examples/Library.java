package examples;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;

public final class Library {

    public static final int FEE_PENCE_PER_DAY = 50;

    public record Loan(String title, LocalDate due) {}

    private Library() {}

    /** Fee in pence for returning a loan: 50p per day past the due date. */
    public static int lateFee(Loan loan, LocalDate returnedOn) {
        long daysLate = Math.max(0, ChronoUnit.DAYS.between(loan.due(), returnedOn));
        return Math.toIntExact(daysLate) * FEE_PENCE_PER_DAY;
    }

    /** A member may borrow as long as none of their loans is overdue. */
    public static boolean mayBorrow(List<Loan> loans, LocalDate on) {
        return loans.stream().noneMatch(loan -> loan.due().isBefore(on));
    }
}
