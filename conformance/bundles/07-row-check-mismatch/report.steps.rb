require "oselvar/var"

param, stimulus, sensor = steps { {} }

sensor.("I report the score and grade") { |_state, _row = nil| { "score" => "99", "grade" => "A" } }
