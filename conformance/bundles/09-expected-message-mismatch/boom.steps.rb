require "varar"

steps do
  stimulus("I always boom") { |_state| raise "actual different error" }
end
