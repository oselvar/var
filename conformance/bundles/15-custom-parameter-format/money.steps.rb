require "varar"

# Custom {money} parameter type with a `format` — the inverse of `parse`,
# rendering a value back in the document's notation. The sensor returns the
# WRONG Money on purpose: the golden pins the formatted actual ("£2.60"),
# proving every port renders parameter mismatches through `format` identically.
steps do
  param(
    "money",
    '£\d+\.\d{2}',
    parse: ->(raw) { { "currency" => "GBP", "value" => raw[1..].to_f } },
    format: ->(money) { format("£%.2f", money["value"]) }
  )

  sensor("The late fee is {money}") { |_state, _fee| { "currency" => "GBP", "value" => 2.6 } }
end
