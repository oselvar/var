# frozen_string_literal: true

require 'varar/core'
require 'varar/internal'
require 'varar/dsl'

module Varar
  # The author facade: `steps` (top-level DSL) → [param, stimulus, sensor],
  # backed by the module-scope accumulator in Internal.
  VERSION = '0.4.2'
end
