require "oselvar/var"

param, stimulus, sensor = steps { {} }

stimulus.("I have {int} cukes") { |_state, _n| }
stimulus.("I have 5 cukes") { |_state| }
