@file:JvmName("GreetSteps")

// Kotlin sibling of greet.steps.ts / greet.steps.py / GreetSteps.java (bundle
// 12-combining-marks).
package com.oselvar.varkt.conformance.bundle12

import com.oselvar.varkt.defineState
import com.oselvar.varkt.sensor

class Ctx

val steps = defineState(::Ctx) {
    sensor("I greet {string}") { name: String -> null }
}
