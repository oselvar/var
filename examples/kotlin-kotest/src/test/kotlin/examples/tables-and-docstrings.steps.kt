@file:JvmName("TablesAndDocStringsSteps")

package examples

import com.oselvar.varkt.defineState
import com.oselvar.varkt.sensor

class TablesCtx

val tablesAndDocStringsSteps = defineState(::TablesCtx) {
    // Whole-table mode: the table arrives as List<List<String>> (header row
    // first). It is this sensor's only slot, so return the reproduced table
    // bare — Vár compares every cell.
    sensor("Uppercase each one:") { rows: List<List<String>> ->
        rows.drop(1).map { row -> mapOf("before" to row[0], "after" to row[0].uppercase()) }
    }
    // Doc-string mode: two slots ({word} plus the trailing doc string), so
    // return one element per slot.
    sensor("Greet {word}:") { name: String, _: String ->
        listOf(name, "Hello, $name!\n")
    }
}
