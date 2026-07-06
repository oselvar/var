@file:JvmName("LibrarySteps")

package examples

import com.oselvar.varkt.defineState
import com.oselvar.varkt.sensor
import com.oselvar.varkt.stimulus
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.roundToInt

data class LibraryCtx(
    val loans: List<Loan> = emptyList(),
    val fee: Money = gbp(0.0),
    val granted: Boolean = false,
)

/** June 6, 2026 → LocalDate 2026-06-06. */
private val DATE_FORMAT = DateTimeFormatter.ofPattern("MMMM d, yyyy", Locale.ENGLISH)

/** £2.50 and 50p, both as GBP Money. */
private fun toMoney(raw: String): Money =
    if (raw.endsWith("p")) gbp(raw.dropLast(1).toDouble() / 100)
    else gbp(raw.drop(1).toDouble())

/** The inverse: mismatches render as £2.60 / 50p, not as a Money dump. */
private fun formatMoney(m: Money): String =
    if (m.value < 1) "${(m.value * 100).roundToInt()}p"
    else "£%.2f".format(Locale.ROOT, m.value)

val librarySteps =
    defineState(::LibraryCtx) {
        parameterType("date", Regex("""[A-Z][a-z]+ \d{1,2}, \d{4}""")) { groups ->
            LocalDate.parse(groups[0], DATE_FORMAT)
        }
        // £2.50 and 50p, both as GBP Money. The amount is cucumber-expressions'
        // float regexp, minus the scientific notation.
        parameterType(
            "money",
            Regex("""£(?=.*\d.*)[-+]?\d*(?:\.(?=\d.*))?\d*|\d+p"""),
            format = ::formatMoney,
        ) { groups ->
            toMoney(groups[0])
        }
        // Emphasis (*Emma*) is stripped before matching, so a title is a
        // Title Case run in the plain prose.
        parameterType("title", Regex("[A-Z][a-z]+(?: [A-Z][a-z]+)*")) { groups -> groups[0] }

        stimulus("borrowed {title}, due back on {date}") { title: String, due: LocalDate ->
            copy(loans = loans + Loan(title, due))
        }
        stimulus("returns it on {date}") { returnedOn: LocalDate ->
            copy(fee = loans.fold(gbp(0.0)) { acc, loan -> addMoney(acc, lateFee(loan, returnedOn)) })
        }
        sensor("owes a {money} late fee") { _: Money -> fee }
        sensor("{money} for each day overdue") { _: Money -> FEE_PER_DAY }
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
