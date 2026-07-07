# frozen_string_literal: true

require "json"

module Oselvar
  module Var
    module Core
      # Serialize a value to canonical JSON, byte-for-byte compatible with
      # JS `JSON.stringify(sortKeys(value), null, 2) + "\n"`:
      # recursively key-sorted objects, 2-space indent, LF, trailing newline,
      # non-ASCII emitted raw, empty containers as `{}`/`[]`.
      #
      # Ruby's JSON.pretty_generate renders empty arrays/objects as "[\n\n]",
      # diverging from JS, so the container layout is hand-rolled. Scalar
      # encoding (string escaping, numbers, booleans, null) is delegated to the
      # stdlib, which matches JS: escapes " \ \b \f \n \r \t and control chars
      # as \uXXXX, keeps non-ASCII raw, does not escape "/".
      module CanonicalJson
        module_function

        def canonical_stringify(value)
          "#{encode(value, "")}\n"
        end

        def encode(value, indent)
          case value
          when Hash
            return "{}" if value.empty?

            inner = "#{indent}  "
            items = value.keys.sort.map do |key|
              "#{inner}#{key.to_s.to_json}: #{encode(value[key], inner)}"
            end
            "{\n#{items.join(",\n")}\n#{indent}}"
          when Array
            return "[]" if value.empty?

            inner = "#{indent}  "
            items = value.map { |element| "#{inner}#{encode(element, inner)}" }
            "[\n#{items.join(",\n")}\n#{indent}]"
          else
            value.to_json
          end
        end
      end
    end
  end
end
