# frozen_string_literal: true

require 'varar'
require_relative '../lib/yahtzee'

steps do
  # Header-bound table: the paragraph names every header cell (dice, category,
  # score), so this sensor runs once per row with the row as a hash keyed by
  # header. Returning {"score" => …} checks that column; the rest are inputs.
  sensor('Examples of dice, category and score') do |_state, row|
    dice = row['dice'].split(',').map { |d| d.strip.to_i }
    { 'score' => Yahtzee.score(dice, row['category']) }
  end
end
