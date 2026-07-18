require "varar"

# No initial state: these steps are pure, so steps is called without state and
# handlers get an empty hash.
steps do
  stimulus("I warm up my mental math") { |_state| }

  sensor("The square of {int} is {int}.") { |_state, n, _expected| [n, n * n] }
end
