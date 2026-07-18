# frozen_string_literal: true

require 'varar/core/span'
require 'varar/core/ast'
require 'varar/core/table_cells'

module Varar
  module Core
    # Markdown block scanner. Port of scanner.ts. All offsets count UTF-16
    # code units; split_lines advances by utf16_len(line) + 1 per newline, and
    # code-point indices from String#index are converted to UTF-16 before use.
    module Scanner
      RawLine = Data.define(:text, :start_offset, :end_offset)

      # Regexes — verbatim ports of the TS constants (`#` escaped as `\#` so
      # Ruby does not read `#{...}` as interpolation).
      THEMATIC_RE = /^\s*([-*_])(\s*\1){2,}\s*$/
      UL_RE = /^(\s*)([-*+])\s+(.*)$/
      OL_RE = /^(\s*)(\d+)([.)])\s+(.*)$/
      BQ_RE = /^>\s?(.*)$/
      FENCE_RE = /^(`{3,})\s*(\S*)\s*$/
      ROW_RE = /^\|(.+)\|\s*$/
      DELIM_RE = /^\|\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|\s*$/
      HEADING_RE = /^(\#{1,6})\s+(.*?)(?:\s+\#+)?\s*$/
      PARA_HEADING_RE = /^\#{1,6}\s+/

      module_function

      # Scan +source+ into an immutable Array of Block nodes.
      def scan(source, plugins = [])
        blocks = []
        lines = split_lines(source)

        i = 0
        while i < lines.length
          line = lines[i]
          if line.text.strip.empty?
            i += 1
            next
          end

          matched = run_plugins(source, lines, i, plugins)
          if matched
            blocks << matched[0]
            i = matched[1]
            next
          end

          fence_result = try_fence(source, lines, i)
          if fence_result
            blocks << fence_result[0]
            i = fence_result[1]
            next
          end

          table_result = try_table(source, lines, i)
          if table_result
            blocks << table_result[0]
            i = table_result[1]
            next
          end

          thematic = try_thematic(source, line)
          if thematic
            blocks << thematic
            i += 1
            next
          end

          bq_result = try_blockquote(source, lines, i)
          if bq_result
            blocks << bq_result[0]
            i = bq_result[1]
            next
          end

          heading = try_heading(source, line)
          if heading
            blocks << heading
            i += 1
            next
          end

          list_item = try_list_item(source, line)
          if list_item
            blocks << list_item
            i += 1
            next
          end

          paragraph, next_i = consume_paragraph(source, lines, i, plugins)
          blocks << paragraph
          i = next_i
        end

        blocks
      end

      def run_plugins(source, lines, start_idx, plugins)
        plugins.each do |p|
          r = p.try_scan(source: source, lines: lines, start_idx: start_idx)
          return r if r
        end
        nil
      end

      # Split +source+ into RawLines with UTF-16 start/end offsets.
      def split_lines(source)
        out = []
        start_u16 = 0
        current_u16 = 0
        start_cp = 0

        source.each_char.with_index do |ch, cp_i|
          if ch == "\n"
            out << RawLine.new(text: source[start_cp...cp_i], start_offset: start_u16, end_offset: current_u16)
            start_u16 = current_u16 + 1 # '\n' is BMP → 1 UTF-16 unit
            start_cp = cp_i + 1
          end
          current_u16 += ch.ord > 0xFFFF ? 2 : 1
        end

        out << RawLine.new(text: source[start_cp..] || '', start_offset: start_u16, end_offset: current_u16)
        out
      end

      def try_thematic(source, line)
        return nil unless THEMATIC_RE.match?(line.text)

        ThematicBreak.new(span: Offsets.span_from_offsets(source, line.start_offset, line.end_offset))
      end

      def try_heading(source, line)
        m = HEADING_RE.match(line.text)
        return nil unless m

        Heading.new(
          level: m[1].length,
          text: (m[2] || '').strip,
          span: Offsets.span_from_offsets(source, line.start_offset, line.end_offset)
        )
      end

      def try_list_item(source, line)
        if (ul = UL_RE.match(line.text))
          text = ul[3] || ''
          marker_start = line.start_offset + Offsets.utf16_len(ul[1] || '')
          marker_end = marker_start + Offsets.utf16_len(ul[2] || '')
          cp_idx = line.text.index(text)
          text_start = line.start_offset + Offsets.to_utf16_offset(line.text, cp_idx)
          return ListItem.new(
            text: text,
            span: Offsets.span_from_offsets(source, line.start_offset, line.end_offset),
            segment_map: [SegmentOffset.new(text_offset: 0, source_offset: text_start)],
            ordered: false,
            marker_span: Offsets.span_from_offsets(source, marker_start, marker_end)
          )
        end

        if (ol = OL_RE.match(line.text))
          text = ol[4] || ''
          marker_start = line.start_offset + Offsets.utf16_len(ol[1] || '')
          marker_end = marker_start + Offsets.utf16_len(ol[2] || '') + Offsets.utf16_len(ol[3] || '')
          cp_idx = line.text.index(text)
          text_start = line.start_offset + Offsets.to_utf16_offset(line.text, cp_idx)
          return ListItem.new(
            text: text,
            span: Offsets.span_from_offsets(source, line.start_offset, line.end_offset),
            segment_map: [SegmentOffset.new(text_offset: 0, source_offset: text_start)],
            ordered: true,
            marker_span: Offsets.span_from_offsets(source, marker_start, marker_end)
          )
        end

        nil
      end

      def try_blockquote(source, lines, start_idx)
        return nil if start_idx >= lines.length

        first = lines[start_idx]
        m = BQ_RE.match(first.text)
        return nil unless m

        first_segment = m[1] || ''
        cp_idx = first.text.index(first_segment)
        segments = [first_segment]
        segment_map = [
          SegmentOffset.new(
            text_offset: 0,
            source_offset: first.start_offset + Offsets.to_utf16_offset(first.text, cp_idx)
          )
        ]
        joined_text_offset = Offsets.utf16_len(first_segment)

        i = start_idx + 1
        end_offset = first.end_offset
        while i < lines.length
          ln = lines[i]
          next_m = BQ_RE.match(ln.text)
          break unless next_m

          segment = next_m[1] || ''
          cp_idx2 = ln.text.index(segment)
          joined_text_offset += 1 # newline separator
          segment_map << SegmentOffset.new(
            text_offset: joined_text_offset,
            source_offset: ln.start_offset + Offsets.to_utf16_offset(ln.text, cp_idx2)
          )
          segments << segment
          joined_text_offset += Offsets.utf16_len(segment)
          end_offset = ln.end_offset
          i += 1
        end

        [
          Blockquote.new(
            text: segments.join("\n"),
            span: Offsets.span_from_offsets(source, first.start_offset, end_offset),
            segment_map: segment_map
          ),
          i
        ]
      end

      def consume_paragraph(source, lines, start_idx, plugins)
        raise 'invariant: start_idx out of range' if start_idx >= lines.length

        first = lines[start_idx]
        end_idx = start_idx
        while end_idx + 1 < lines.length
          candidate_idx = end_idx + 1
          candidate = lines[candidate_idx]
          break if candidate.text.strip.empty?
          break if PARA_HEADING_RE.match?(candidate.text)
          break if UL_RE.match?(candidate.text)
          break if OL_RE.match?(candidate.text)
          break if BQ_RE.match?(candidate.text)
          break if FENCE_RE.match?(candidate.text)
          break if ROW_RE.match?(candidate.text)
          break if THEMATIC_RE.match?(candidate.text)
          break if run_plugins(source, lines, candidate_idx, plugins)

          end_idx += 1
        end

        last = lines[end_idx]
        start_offset = first.start_offset
        end_offset = last.end_offset
        [
          Paragraph.new(
            text: Offsets.utf16_slice(source, start_offset, end_offset),
            span: Offsets.span_from_offsets(source, start_offset, end_offset),
            segment_map: [SegmentOffset.new(text_offset: 0, source_offset: start_offset)]
          ),
          end_idx + 1
        ]
      end

      def try_fence(source, lines, start_idx)
        return nil if start_idx >= lines.length

        start = lines[start_idx]
        open_m = FENCE_RE.match(start.text)
        return nil unless open_m

        fence_marker = open_m[1] || ''
        info = (open_m[2] || '').strip

        i = start_idx + 1
        body_start = nil
        body_end = nil
        end_offset = start.end_offset

        while i < lines.length
          ln = lines[i]
          close_m = FENCE_RE.match(ln.text)
          if close_m && (close_m[1] || '').length >= fence_marker.length
            end_offset = ln.end_offset
            break
          end
          body_start = ln.start_offset if body_start.nil?
          body_end = ln.end_offset + 1 # +1 to include the '\n' after this line
          i += 1
        end

        body = body_start.nil? || body_end.nil? ? '' : Offsets.utf16_slice(source, body_start, body_end)

        fallback = start.end_offset
        body_span = Offsets.span_from_offsets(source, body_start || fallback, body_end || fallback)
        [
          Fence.new(
            info: info,
            body: body,
            body_span: body_span,
            span: Offsets.span_from_offsets(source, start.start_offset, end_offset)
          ),
          i + 1
        ]
      end

      def try_table(source, lines, start_idx)
        return nil if start_idx + 1 >= lines.length

        header_line = lines[start_idx]
        delim_line = lines[start_idx + 1]
        return nil unless ROW_RE.match?(header_line.text)
        return nil unless DELIM_RE.match?(delim_line.text)

        header_cells, header_cell_spans = TableCells.parse_row_cells(header_line.text, header_line.start_offset,
                                                                     source)
        header = Row.new(
          cells: header_cells,
          cell_spans: header_cell_spans,
          span: Offsets.span_from_offsets(source, header_line.start_offset, header_line.end_offset)
        )

        rows = []
        i = start_idx + 2
        while i < lines.length
          ln = lines[i]
          break unless ROW_RE.match?(ln.text)

          cells, cell_spans = TableCells.parse_row_cells(ln.text, ln.start_offset, source)
          rows << Row.new(
            cells: cells,
            cell_spans: cell_spans,
            span: Offsets.span_from_offsets(source, ln.start_offset, ln.end_offset)
          )
          i += 1
        end

        last_row = rows.last
        end_offset = last_row ? last_row.span.end_offset : delim_line.end_offset
        [
          Table.new(
            span: Offsets.span_from_offsets(source, header_line.start_offset, end_offset),
            header: header,
            rows: rows
          ),
          i
        ]
      end
    end
  end
end
