require "oselvar/var"

steps do
  sensor("I echo the following:") { |_state, _doc| "goodbye" }
end
