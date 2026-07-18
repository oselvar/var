# frozen_string_literal: true

require 'varar/core/span'

module Varar
  module Core
    # Parse a Markdown/Gherkin table row into trimmed cells and per-cell source
    # spans. Port of table-cells.ts. All offsets count UTF-16 code units.
    module TableCells
      module_function

      # Split a `| a | b |` row into [cells, cell_spans]. +line_start_offset+
      # is the UTF-16 offset of the row's first character within +source+.
      def parse_row_cells(line_text, line_start_offset, source)
        first_cp = line_text.index('|')
        last_cp = line_text.rindex('|')
        return [[], []] if first_cp.nil? || last_cp.nil? || last_cp <= first_cp

        # Pipe positions: convert code-point index to UTF-16 (matters when
        # astral chars precede the pipe). '|' is ASCII → 1 UTF-16 unit.
        first_u16 = Offsets.to_utf16_offset(line_text, first_cp)
        inner_start_u16 = first_u16 + 1

        inner = line_text[(first_cp + 1)...last_cp]

        cells = []
        cell_spans = []
        cursor = 0 # running UTF-16 position within inner

        # split(-1) keeps trailing empty segments, matching JS/Python split.
        inner.split('|', -1).each do |seg|
          trimmed = seg.strip
          leading = Offsets.utf16_len(seg) - Offsets.utf16_len(seg.lstrip)
          abs_start = line_start_offset + inner_start_u16 + cursor + leading
          cells << trimmed
          cell_spans << Offsets.span_from_offsets(source, abs_start, abs_start + Offsets.utf16_len(trimmed))
          cursor += Offsets.utf16_len(seg) + 1 # +1 for the '|' delimiter
        end

        [cells, cell_spans]
      end
    end
  end
end
