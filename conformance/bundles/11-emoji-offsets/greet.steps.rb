require "varar"

steps do
  sensor("I greet {string}") { |_state, _s, *_extra| nil }
end
