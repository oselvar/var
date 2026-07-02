@file:JvmName("SmokeSteps")

package com.oselvar.varkt.kotest.fixtures

import com.oselvar.varkt.action
import com.oselvar.varkt.context
import com.oselvar.varkt.defineState
import com.oselvar.varkt.sensor

data class SmokeCtx(val cukes: Int = 0)

val steps = defineState(::SmokeCtx) {
    context("I have {int} cukes") { n: Int -> copy(cukes = n) }
    action("I eat {int} cukes") { n: Int -> copy(cukes = cukes - n) }
    sensor("I should have {int} cukes left") { cukes }
}
