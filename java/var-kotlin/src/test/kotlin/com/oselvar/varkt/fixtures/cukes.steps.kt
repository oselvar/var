@file:JvmName("CukeSteps")

package com.oselvar.varkt.fixtures

import com.oselvar.varkt.sensor
import com.oselvar.varkt.steps
import com.oselvar.varkt.stimulus

data class CukeCtx(val cukes: Int = 0)

val steps =
    steps(::CukeCtx) {
        stimulus("I have {int} cukes") { n: Int ->
            copy(cukes = n)
        }
        stimulus("I eat {int} cukes") { n: Int ->
            copy(cukes = cukes - n)
        }
        sensor("I should have {int} cukes left") {
            cukes
        }
    }
