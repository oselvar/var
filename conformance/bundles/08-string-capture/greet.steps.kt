@file:JvmName("GreetSteps")

// Kotlin sibling of greet.steps.ts / greet.steps.py / GreetSteps.java (bundle
// 08-string-capture).
package com.oselvar.varkt.conformance.bundle08

import com.oselvar.varkt.action
import com.oselvar.varkt.defineState

class Ctx

val steps = defineState(::Ctx) {
    action("I greet {string}") { name: String -> this }
}
