@file:JvmName("SmokeSteps")

package com.oselvar.varkt.kotest.fixtures

import com.oselvar.varkt.defineState
import com.oselvar.varkt.sensor
import com.oselvar.varkt.stimulus

data class SmokeCtx(val cukes: Int = 0)

val steps =
    defineState(::SmokeCtx) {
        stimulus("I have {int} cukes") { n: Int -> copy(cukes = n) }
        stimulus("I eat {int} cukes") { n: Int -> copy(cukes = cukes - n) }
        sensor("I should have {int} cukes left") { cukes }
    }
