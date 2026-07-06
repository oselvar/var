@file:JvmName("RomanNumeralsSteps")

package examples

import com.oselvar.varkt.defineState
import com.oselvar.varkt.sensor

class RomanNumeralsCtx

val romanNumeralsSteps =
    defineState(::RomanNumeralsCtx) {
        sensor("a decimal and a roman number") { row: Map<String, String> ->
            mapOf(
                "decimal" to row.getValue("decimal"),
                "roman" to toRoman(row.getValue("decimal").toInt()),
            )
        }
    }
