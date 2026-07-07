# frozen_string_literal: true

require 'oselvar/var'

steps do
  sensor('life, the universe and everything is {int}') { |_state, _answer| 42 }
end
