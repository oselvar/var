require "oselvar/var"

param, stimulus, sensor = steps { { count: 0 } }

stimulus.("I increment") { |state| { count: state[:count] + 1 } }

sensor.("The count is {int}") do |state, n|
  raise "expected #{n} but got #{state[:count]}" if state[:count] != n
end
