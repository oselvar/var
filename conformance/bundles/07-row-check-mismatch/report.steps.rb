require "varar"

steps do
  sensor("I report the score and grade") { |_state, _row = nil| { "score" => "99", "grade" => "A" } }
end
