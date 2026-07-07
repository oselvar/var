require "oselvar/var"

# No state factory: these steps are pure, so steps is called bare and handlers
# get an empty hash as state.
param, stimulus, sensor = steps

stimulus.("I warm up my mental math") { |_state| }

sensor.("The square of {int} is {int}.") { |_state, n, _expected| [n, n * n] }
