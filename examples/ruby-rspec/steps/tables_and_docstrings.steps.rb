# frozen_string_literal: true

require 'varar'

steps do
  # Whole-table mode: the table arrives as an array of rows (header row first).
  # It is this sensor's only slot, so return the reproduced table bare — Vár
  # compares every cell.
  sensor('Uppercase each one:') do |_state, rows|
    rows[1..].map { |before, *| { 'before' => before, 'after' => before.upcase } }
  end

  # Doc-string mode: two slots ({word} plus the trailing doc string), so return
  # one element per slot.
  sensor('Greet {word}:') do |_state, name, _doc|
    [name, "Hello, #{name}!\n"]
  end
end
