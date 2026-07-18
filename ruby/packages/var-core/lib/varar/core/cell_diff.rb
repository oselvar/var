# frozen_string_literal: true

module Varar
  module Core
    # One checked column of one header-bound row: the cell text and its span.
    RowCheck = Data.define(:column, :value, :span)

    # The verdict for one checked column after comparing against the table.
    # expected_value/actual_value/formatted are adapter-facing, never serialized.
    CellDiff = Data.define(:column, :span, :expected, :actual, :ok,
                           :expected_value, :actual_value, :formatted) do
      def initialize(column:, span:, expected:, actual:, ok:,
                     expected_value: nil, actual_value: nil, formatted: false)
        super
      end
    end

    # The step returned the wrong type/shape — an author mistake, not a value diff.
    class ReturnShapeError < StandardError; end

    # Raised when a header-bound row's / a table's returned columns don't match.
    class CellMismatchError < StandardError
      attr_reader :cells

      def initialize(cells)
        @cells = cells
        super(cells.map { |c| "#{c.column}: expected #{c.expected} but was #{c.actual}" }.join('; '))
      end
    end

    # Pure comparison of row/table step returns against the authored cells.
    # Port of cell-diff.ts.
    module CellDiffs
      module_function

      # Display rules 2-4 of the mismatch-rendering chain (rule 1, the
      # parameter type's `format`, is applied in param_diff). A string renders
      # as-is, other primitives via to_s, anything else via inspect. The
      # inspect fallback is port-native and deliberately outside conformance.
      def render_cell_value(value)
        return value if value.is_a?(String)
        return value.to_s if value.nil? || value == true || value == false ||
                             value.is_a?(Integer) || value.is_a?(Float)

        value.inspect
      end

      # Compare a row step's returned Hash against the row's cells. Only columns
      # present on +returned+ are checked; a non-Hash return checks nothing.
      def compare_row(returned, checks)
        return [] unless returned.is_a?(Hash)

        checks.filter_map do |check|
          next unless returned.key?(check.column)

          actual = render_cell_value(returned[check.column])
          CellDiff.new(column: check.column, span: check.span, expected: check.value,
                       actual: actual, ok: actual == check.value)
        end
      end

      # Compare a whole-table step's returned table against the input table.
      # +returned+: nil (no checks), Array of Arrays (positional), or Array of
      # Hashes (keyed by header). Cells compare as exact strings.
      def compare_table(returned, input_table)
        return [] if returned.nil?
        raise ReturnShapeError, "expected a table (array of rows), got #{returned.class}" unless returned.is_a?(Array)

        columns = input_table.header.cells
        data_rows = input_table.rows
        if returned.length != data_rows.length
          raise ReturnShapeError, "expected #{data_rows.length} row(s), got #{returned.length}"
        end

        all_arrays = returned.all?(Array)
        all_records = returned.all?(Hash)
        raise ReturnShapeError, 'table rows must be all arrays or all objects' if !all_arrays && !all_records

        diffs = []
        data_rows.each_with_index do |row, i|
          ret = returned[i]
          if all_arrays && ret.length != columns.length
            raise ReturnShapeError, "row #{i}: expected #{columns.length} column(s), got #{ret.length}"
          end

          columns.each_with_index do |column, j|
            if all_arrays
              actual_value = ret[j]
            else
              raise ReturnShapeError, "row #{i}: missing column \"#{column}\"" unless ret.key?(column)

              actual_value = ret[column]
            end
            expected = j < row.cells.length ? row.cells[j] : ''
            actual = render_cell_value(actual_value)
            span = j < row.cell_spans.length ? row.cell_spans[j] : row.span
            diffs << CellDiff.new(column: column, span: span, expected: expected, actual: actual,
                                  ok: actual == expected)
          end
        end
        diffs
      end
    end
  end
end
