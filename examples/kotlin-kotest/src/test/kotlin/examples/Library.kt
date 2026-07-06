package examples

import java.time.LocalDate
import java.time.temporal.ChronoUnit

const val FEE_PENCE_PER_DAY = 50

data class Loan(val title: String, val due: LocalDate)

/** Fee in pence for returning a loan: 50p per day past the due date. */
fun lateFee(loan: Loan, returnedOn: LocalDate): Int {
    val daysLate = maxOf(0, ChronoUnit.DAYS.between(loan.due, returnedOn))
    return daysLate.toInt() * FEE_PENCE_PER_DAY
}

/** A member may borrow as long as none of their loans is overdue. */
fun mayBorrow(loans: List<Loan>, on: LocalDate): Boolean = loans.none { it.due.isBefore(on) }
