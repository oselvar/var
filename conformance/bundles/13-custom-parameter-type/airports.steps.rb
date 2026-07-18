require "varar"

steps do
  # Custom {airport} parameter type: IATA code, lowercased by the parse function.
  # The lowercasing is asserted by the sensor (the .md says "lhr"), so an identity
  # parse fails this bundle — proving parse functions execute.
  param("airport", "[A-Z]{3}", parse: ->(code) { code.downcase })

  stimulus("I fly to {airport}") { |_state, dest| { dest: dest } }

  sensor("The destination code is {word}") do |state, expected|
    cleaned = expected.sub(/[.!?]$/, "")
    raise "expected #{cleaned} but got #{state[:dest]}" if state[:dest] != cleaned
  end
end
