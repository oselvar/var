# frozen_string_literal: true

require "oselvar/var/internal"

# `steps` as a top-level method, available in any step file after
# `require "oselvar/var"` (idiomatic for BDD step DSLs, like Cucumber-Ruby's
# Given/When/Then). Returns [param, stimulus, sensor]. The context factory is
# keyed by the calling file so contexts never bleed across step files.
module Kernel
  private

  def steps(factory = nil, &block)
    Oselvar::Var::Internal.register(block || factory, caller_locations(1, 1).first.path)
  end
end
