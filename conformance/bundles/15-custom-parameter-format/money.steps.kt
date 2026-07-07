@file:JvmName("MoneySteps")

// Kotlin sibling of money.steps.ts / money.steps.py / MoneySteps.java
// (bundle 15-custom-parameter-format) — exercises StepsScope.param's
// `format` parameter: the inverse of `parse`, rendering a value back in the
// document's notation. The sensor returns the WRONG Money on purpose: the
// golden pins the formatted actual ("£2.60"), proving every port renders
// parameter mismatches through `format` identically. Without a format this
// actual would be each port's native object rendering, which is deliberately
// outside conformance.
package com.oselvar.varkt.conformance.bundle15

import com.oselvar.varkt.steps
import com.oselvar.varkt.sensor
import java.util.Locale

val steps = steps {
    param(
        "money",
        Regex("""£\d+\.\d{2}"""),
        format = { m: Map<String, Any> -> String.format(Locale.ROOT, "£%.2f", m["value"]) },
    ) { groups ->
        mapOf("currency" to "GBP", "value" to groups[0].substring(1).toDouble())
    }
    sensor("The late fee is {money}") { fee: Map<String, Any> ->
        mapOf("currency" to "GBP", "value" to 2.6)
    }
}
