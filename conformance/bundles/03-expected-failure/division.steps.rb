require "oselvar/var"

param, stimulus, sensor = steps { {} }

stimulus.("I divide {int} by {int}") do |_state, _a, b|
  raise ZeroDivisionError, "division by zero" if b.zero?
end
