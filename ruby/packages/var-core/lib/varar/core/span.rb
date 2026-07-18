# frozen_string_literal: true

module Varar
  module Core
    # A source span. Offsets and columns are **UTF-16 code units** (an astral
    # character like 😀 counts as 2), matching the goldens and LSP's default
    # position encoding. Lines/cols are 1-based.
    Span = Data.define(
      :start_offset, :end_offset,
      :start_line, :start_col,
      :end_line, :end_col
    )

    # UTF-16 offset conversion. Ruby strings are code-point indexed, so the
    # whole core converts to/from UTF-16 code units here (the single riskiest
    # part of the port — mirrors Python's span.py). Reused by the matcher and
    # by hash.rb.
    module Offsets
      module_function

      # UTF-16 code-unit length of a string (astral chars count as 2).
      def utf16_len(str)
        n = 0
        str.each_char { |ch| n += ch.ord > 0xFFFF ? 2 : 1 }
        n
      end

      # UTF-16 offset of the code-point index `cp_index` in `source`.
      def to_utf16_offset(source, cp_index)
        utf16_len(source[0...cp_index])
      end

      # Inverse of to_utf16_offset: the code-point index at a UTF-16 offset.
      def cp_index_for_utf16(source, u16)
        count = 0
        source.each_char.with_index do |ch, i|
          return i if count >= u16

          count += ch.ord > 0xFFFF ? 2 : 1
        end
        source.length
      end

      # Slice `source` by UTF-16 offsets, returning the covered substring.
      def utf16_slice(source, start_u16, end_u16)
        a = cp_index_for_utf16(source, start_u16)
        b = cp_index_for_utf16(source, end_u16)
        source[a...b]
      end

      # 1-based [line, col] at a UTF-16 offset; col counts UTF-16 units and
      # resets to 1 after each newline (mirrors span.ts's lineCol).
      def line_col(source, offset_u16)
        line = 1
        col = 1
        count = 0
        source.each_char do |ch|
          break if count >= offset_u16

          width = ch.ord > 0xFFFF ? 2 : 1
          if ch == "\n"
            line += 1
            col = 1
          else
            col += width
          end
          count += width
        end
        [line, col]
      end

      # Build a Span from UTF-16 start/end offsets.
      def span_from_offsets(source, start_u16, end_u16)
        start_line, start_col = line_col(source, start_u16)
        end_line, end_col = line_col(source, end_u16)
        Span.new(
          start_offset: start_u16, end_offset: end_u16,
          start_line: start_line, start_col: start_col,
          end_line: end_line, end_col: end_col
        )
      end
    end
  end
end
