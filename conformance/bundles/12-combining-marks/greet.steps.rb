require "oselvar/var"

param, stimulus, sensor = steps { {} }

sensor.("I greet {string}") { |_state, _s| nil }
