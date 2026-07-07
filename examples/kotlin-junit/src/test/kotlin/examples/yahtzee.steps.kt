@file:JvmName("YahtzeeSteps")

package examples

import com.oselvar.varkt.sensor
import com.oselvar.varkt.steps

val yahtzeeSteps = steps {
    // Header-bound table: the paragraph names every header cell (dice,
    // category, score), so this sensor runs once per row with the row as a
    // Map keyed by header. Returning mapOf("score" to …) checks that column;
    // the other columns are inputs.
    sensor("Examples of dice, category and score") { row: Map<String, String> ->
        val dice = row.getValue("dice").split(",").map { it.trim().toInt() }
        mapOf("score" to score(dice, row.getValue("category")))
    }
}
