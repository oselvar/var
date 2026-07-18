# frozen_string_literal: true

require 'varar'

steps do
  sensor('life, the universe and everything is {int}') { 42 }
end
