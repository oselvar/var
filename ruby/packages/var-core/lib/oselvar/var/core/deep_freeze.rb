# frozen_string_literal: true

module Oselvar
  module Var
    module Core
      # Recursively freeze plain Hash/Array so handler code mutating state raises
      # FrozenError. Other objects (class instances, primitives, nil) pass
      # through. Assumes acyclic input. Port of deep-freeze.ts.
      module DeepFreeze
        module_function

        def deep_freeze(value)
          case value
          when Hash
            value.each_value { |v| deep_freeze(v) }
            value.freeze
          when Array
            value.each { |v| deep_freeze(v) }
            value.freeze
          else
            value
          end
        end
      end
    end
  end
end
