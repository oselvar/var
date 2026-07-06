@file:JvmName("DeepThoughtSteps")

package examples

import com.oselvar.varkt.defineState
import com.oselvar.varkt.sensor

class DeepThoughtCtx

val deepThoughtSteps = defineState(::DeepThoughtCtx) {
    sensor("life, the universe and everything is {int}") { _: Int -> 42 }
}
