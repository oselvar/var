# frozen_string_literal: true

require 'varar/core/cell_diff'

module Varar
  module Core
    # A doc-string content difference: fence body span, expected, actual.
    DocStringDiff = Data.define(:span, :expected, :actual)

    # Raised when a doc-string step's returned string differs from the content.
    class DocStringMismatchError < StandardError
      attr_reader :diff

      def initialize(diff)
        @diff = diff
        super("doc string: expected #{diff.expected.inspect} but was #{diff.actual.inspect}")
      end
    end

    # Pure comparison of a doc-string step's return against the fence body.
    # Port of doc-string-diff.ts.
    module DocStringDiffs
      module_function

      # nil → no check; equal string → nil (pass); unequal → DocStringDiff;
      # non-string → ReturnShapeError.
      def compare_doc_string(returned, content, span)
        return nil if returned.nil?
        raise ReturnShapeError, "expected a doc string (string), got #{returned.class}" unless returned.is_a?(String)
        return nil if returned == content

        DocStringDiff.new(span: span, expected: content, actual: returned)
      end
    end
  end
end
