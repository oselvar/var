# frozen_string_literal: true

require 'oselvar/var/internal'

# `steps` as a top-level method, available in any step file after
# `require "oselvar/var"` (idiomatic for BDD step DSLs, like Cucumber-Ruby's
# Given/When/Then). It takes a block in which bare `stimulus`, `sensor` and
# `param` register the file's steps:
#
#   steps(greeting: '') do
#     stimulus('I greet {string}') { |_state, name| { greeting: "Hello, #{name}!" } }
#     sensor('the greeting is {string}') { |state, _expected| state[:greeting] }
#   end
#
# The initial state is optional and may be given as keyword arguments, a Hash,
# or a Proc factory (called fresh per example); omit it entirely for stateless
# step files. The state is keyed by the calling file so contexts never bleed
# across step files.
module Kernel
  private

  def steps(state = nil, **kwstate, &block)
    initial =
      if state.is_a?(Proc)
        state
      elsif !kwstate.empty?
        kwstate
      else
        state || {}
      end
    factory = initial.is_a?(Proc) ? initial : -> { initial }
    builder = Oselvar::Var::Internal.register(factory, caller_locations(1, 1).first.path)
    builder.instance_eval(&block) if block
    nil
  end
end
