# frozen_string_literal: true

require 'varar/core/cell_diff'

module Varar
  module Core
    # The column label a doc-string cell carries in a CellDiff, so its mismatch
    # message reads `doc string: expected … but was …`.
    DOC_STRING_COLUMN = 'doc string'

    # Pure comparison of a doc-string step's return against the fence body.
    # Port of doc-string-diff.ts.
    module DocStringDiffs
      module_function

      # A doc string is ONE CELL, compared whole, so a difference is an ordinary
      # CellDiff and the executor raises the same CellMismatchError as any other
      # cell. `expected`/`actual` are quoted: a doc string routinely differs only
      # in whitespace, and bare text would render a missing trailing newline as
      # no difference at all.
      #
      # nil → no check; equal string → nil (pass); unequal → CellDiff;
      # non-string → ReturnShapeError.
      def compare_doc_string(returned, content, span)
        return nil if returned.nil?
        raise ReturnShapeError, "expected a doc string (string), got #{returned.class}" unless returned.is_a?(String)
        return nil if returned == content

        CellDiff.new(column: DOC_STRING_COLUMN, span: span, expected: content.inspect,
                     actual: returned.inspect, ok: false)
      end
    end
  end
end
