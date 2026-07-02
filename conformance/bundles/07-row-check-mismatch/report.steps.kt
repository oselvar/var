@file:JvmName("ReportSteps")

// Kotlin sibling of report.steps.ts / report.steps.py / ReportSteps.java
// (bundle 07-row-check-mismatch): header-bound row step — receives the current
// row (Map keyed by header cell) as the trailing argument and returns hardcoded
// (wrong) columns, producing a cell mismatch at the trace stage.
package com.oselvar.varkt.conformance.bundle07

import com.oselvar.varkt.defineState
import com.oselvar.varkt.sensor

class Ctx

val steps = defineState(::Ctx) {
    sensor("I report the score and grade") { row: Map<String, String> ->
        mapOf("score" to "99", "grade" to "A")
    }
}
