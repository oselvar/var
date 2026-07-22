# frozen_string_literal: true

require 'varar/core/cell_diff'

module Varar
  module Core
    # Compare a sensor's returned inline actuals against captured document
    # values. Port of param-diff.ts.
    module ParamDiff
      module_function

      # Render one side of a parameter diff as [text, via_format]. The
      # parameter type's format wins (document notation), else the shared
      # string/primitive/inspect chain; a raising formatter falls through.
      def render_param_value(value, format)
        if format
          begin
            return [format.call(value), true]
          rescue StandardError
            # fall through to the native rendering
          end
        end
        [CellDiffs.render_cell_value(value), false]
      end

      # Compare returned actuals against expected document values. Arrays align
      # 1:1; structural equality (==) compares by value across references.
      def compare_params(returned, expected, param_spans, source_texts, formats = nil)
        expected.each_index.map do |i|
          ok = returned[i] == expected[i]
          format = formats && i < formats.length ? formats[i] : nil
          actual_text, via_format = render_param_value(returned[i], format)
          expected_text = if i < source_texts.length
                            source_texts[i]
                          else
                            render_param_value(expected[i], format)[0]
                          end
          CellDiff.new(
            column: "cell #{i + 1}",
            span: param_spans[i],
            expected: expected_text,
            actual: actual_text,
            ok: ok,
            expected_value: expected[i],
            actual_value: returned[i],
            formatted: via_format
          )
        end
      end
    end
  end
end
