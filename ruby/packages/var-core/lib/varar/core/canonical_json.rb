# frozen_string_literal: true

require 'json'

module Varar
  module Core
    # JSON serializers byte-for-byte compatible with JS `JSON.stringify(v, null, 2)`:
    # 2-space indent, LF, trailing newline, non-ASCII raw, empty containers as
    # {}/[]. `canonical_stringify` recursively sorts object keys (the goldens);
    # `ordered_stringify` preserves insertion order (var.lock.json).
    #
    # The container layout is hand-rolled because Ruby's JSON.pretty_generate
    # renders empty arrays/objects as "[\n\n]". Scalar encoding is delegated to
    # the stdlib, which matches JS (escapes " \ control chars, keeps non-ASCII raw).
    module CanonicalJson
      module_function

      def canonical_stringify(value)
        "#{encode(value, '', sort_keys: true)}\n"
      end

      def ordered_stringify(value)
        "#{encode(value, '', sort_keys: false)}\n"
      end

      def encode(value, indent, sort_keys:)
        case value
        when Hash
          return '{}' if value.empty?

          keys = sort_keys ? value.keys.sort : value.keys
          inner = "#{indent}  "
          items = keys.map { |key| "#{inner}#{key.to_s.to_json}: #{encode(value[key], inner, sort_keys: sort_keys)}" }
          "{\n#{items.join(",\n")}\n#{indent}}"
        when Array
          return '[]' if value.empty?

          inner = "#{indent}  "
          items = value.map { |element| "#{inner}#{encode(element, inner, sort_keys: sort_keys)}" }
          "[\n#{items.join(",\n")}\n#{indent}]"
        else
          value.to_json
        end
      end
    end
  end
end
