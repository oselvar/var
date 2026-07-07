require "oselvar/var"

param, stimulus, sensor = steps { {} }

sensor.("I echo the following:") { |_state, _doc| "goodbye" }
