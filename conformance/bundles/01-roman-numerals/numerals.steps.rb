require "oselvar/var"

param, stimulus, sensor = steps { {} }

roman = { 1 => "I", 4 => "IV", 9 => "IX", 40 => "XL" }

stimulus.("I convert {int} to roman numerals") { |_state, n| { result: roman[n] } }

sensor.("The result is {word}") do |state, expected|
  # Strip sentence-ending punctuation captured by {word} when it appears last.
  cleaned = expected.sub(/[.!?]$/, "")
  raise "expected #{cleaned} but got #{state[:result]}" if state[:result] != cleaned
end
