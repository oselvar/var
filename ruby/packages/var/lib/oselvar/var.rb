# frozen_string_literal: true

require "oselvar/var/core"
require "oselvar/var/internal"
require "oselvar/var/dsl"

module Oselvar
  # The author facade: `steps` (top-level DSL) → [param, stimulus, sensor],
  # backed by the module-scope accumulator in Internal.
  module Var
    VERSION = "0.3.2"
  end
end
