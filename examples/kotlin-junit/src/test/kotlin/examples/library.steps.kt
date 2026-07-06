@file:JvmName("LibrarySteps")

package examples

import com.oselvar.varkt.defineState
import com.oselvar.varkt.sensor
import com.oselvar.varkt.stimulus
import java.time.LocalDate

data class LibraryCtx(
    val loans: List<Loan> = emptyList(),
    val feePence: Int = 0,
    val granted: Boolean = false,
)

private val MONTHS =
    listOf(
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
        "December",
    )

/** June 6th → LocalDate 2026-06-06 (the spec's year is 2026). */
private fun toDate(raw: String): LocalDate {
    val (month, day) = raw.split(" ")
    return LocalDate.of(2026, MONTHS.indexOf(month) + 1, day.dropLast(2).toInt())
}

/** £2.50 and 50p, both as pence. */
private fun toPence(raw: String): Int =
    if (raw.startsWith("£")) Math.round(raw.drop(1).toDouble() * 100).toInt()
    else raw.dropLast(1).toInt()

val librarySteps =
    defineState(::LibraryCtx) {
        parameterType(
            "date",
            Regex(
                "(?:January|February|March|April|May|June" +
                    "|July|August|September|October|November|December)" +
                    " \\d{1,2}(?:st|nd|rd|th)"
            ),
        ) { groups ->
            toDate(groups[0])
        }
        parameterType("money", Regex("£\\d+(?:\\.\\d{2})?|\\d+p")) { groups -> toPence(groups[0]) }
        // Emphasis (*Emma*) is stripped before matching, so a title is a
        // Title Case run in the plain prose.
        parameterType("title", Regex("[A-Z][a-z]+(?: [A-Z][a-z]+)*")) { groups -> groups[0] }

        stimulus("borrowed {title}, due back on {date}") { title: String, due: LocalDate ->
            copy(loans = loans + Loan(title, due))
        }
        stimulus("returns it on {date}") { returnedOn: LocalDate ->
            copy(feePence = loans.sumOf { loan -> lateFee(loan, returnedOn) })
        }
        sensor("owes a {money} late fee") { _: Int -> feePence }
        sensor("{money} for each day overdue") { _: Int -> FEE_PENCE_PER_DAY }
        stimulus("asks to borrow {title} on {date}") { _: String, on: LocalDate ->
            copy(granted = mayBorrow(loans, on))
        }
        sensor("the library refuses") {
            if (granted) throw AssertionError("expected the library to refuse")
            null
        }
        sensor("the library agrees") {
            if (!granted) throw AssertionError("expected the library to agree")
            null
        }
    }
