@file:JvmName("RomanNumeralsSteps")

package examples

import com.oselvar.varkt.sensor
import com.oselvar.varkt.steps

val romanNumeralsSteps = steps {
    sensor("a decimal and a roman number") { row: Map<String, String> ->
        mapOf(
            "decimal" to row.getValue("decimal"),
            "roman" to toRoman(row.getValue("decimal").toInt()),
        )
    }
}
