@file:JvmName("DeepThoughtSteps")

package examples

import com.oselvar.varkt.sensor
import com.oselvar.varkt.steps

val deepThoughtSteps = steps {
    sensor("life, the universe and everything is {int}") { _: Int -> 42 }
}
