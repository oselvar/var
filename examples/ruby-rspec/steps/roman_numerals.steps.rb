# frozen_string_literal: true

require 'varar'
require_relative '../lib/roman_numerals'

steps do
  # Header-bound table: this sensor runs once per row with the row as a hash keyed
  # by header. Returning {"roman" => …} checks that column; "decimal" is an input.
  sensor('a decimal and a roman number') do |_state, row|
    { 'decimal' => row['decimal'], 'roman' => RomanNumerals.to_roman(row['decimal'].to_i) }
  end
end
