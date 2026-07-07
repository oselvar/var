@file:JvmName("GreetSteps")

// Kotlin sibling of greet.steps.ts / greet.steps.py / GreetSteps.java (bundle
// 08-string-capture).
package com.oselvar.varkt.conformance.bundle08

import com.oselvar.varkt.stimulus
import com.oselvar.varkt.steps

class Ctx

val steps = steps(::Ctx) {
    stimulus("I greet {string}") { name: String -> this }
}
