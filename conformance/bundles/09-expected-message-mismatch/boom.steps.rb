require "oselvar/var"

param, stimulus, sensor = steps { {} }

stimulus.("I always boom") { |_state| raise "actual different error" }
