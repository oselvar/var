# frozen_string_literal: true

require 'varar/core'

module Varar
  module Runner
    module_function

    # Render a step failure as a human-readable, markdown-anchored string,
    # dispatching on the concrete error type. Port of render.py.
    def render_failure(error, _source, path)
      case error
      when Core::CellMismatchError
        lines = ["Cell mismatch in #{path}:"]
        failing = error.cells.reject(&:ok)
        lines << '  (no failing cells)' if failing.empty?
        failing.each do |cell|
          lines << "  line #{cell.span.start_line} | column '#{cell.column}' — " \
                   "expected: #{cell.expected.inspect}, actual: #{cell.actual.inspect}"
        end
        lines.join("\n")
      when Core::ReturnShapeError
        error.message
      else
        "#{error.class}: #{error.message}"
      end
    end
  end
end
