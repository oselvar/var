# frozen_string_literal: true

module Varar
  module Core
    # Split a block of plain text into sentences on . ! ? and \n, skipping
    # terminators inside backtick spans and double-quoted strings and treating
    # common abbreviations as non-breaking. All offsets are UTF-16 code units
    # into the block text. Port of sentences.ts.
    Sentence = Data.define(:text, :start_offset, :end_offset)

    module Sentences
      ABBREVIATIONS = Set.new(['e.g.', 'i.e.', 'etc.', 'cf.', 'vs.']).freeze

      module_function

      def split_sentences(text)
        cp_to_u16 = build_cp_to_u16(text)
        n = text.length
        out = []

        # Mark no-split zones (backtick spans, double-quoted strings).
        skip = Array.new(n, false)
        j = 0
        while j < n
          c = text[j]
          if ['`', '"'].include?(c)
            close = text.index(c, j + 1)
            break if close.nil?

            (j..close).each { |k| skip[k] = true }
            j = close + 1
            next
          end
          j += 1
        end

        i = 0
        segment_start = 0
        while i < n
          if skip[i]
            i += 1
            next
          end
          ch = text[i]
          if ["\n", '.', '!', '?'].include?(ch)
            if ch == '.' && inside_number_or_abbrev?(text, i)
              i += 1
              next
            end
            stop = i + 1
            push_segment(out, text, segment_start, stop, cp_to_u16)
            i = stop
            i += 1 while i < n && [' ', "\n"].include?(text[i])
            segment_start = i
            next
          end
          i += 1
        end

        push_segment(out, text, segment_start, n, cp_to_u16)
        out
      end

      # cp_to_u16[cp_i] is the UTF-16 offset of text[cp_i].
      def build_cp_to_u16(text)
        result = Array.new(text.length + 1, 0)
        u16 = 0
        text.each_char.with_index do |ch, i|
          result[i] = u16
          u16 += ch.ord > 0xFFFF ? 2 : 1
        end
        result[text.length] = u16
        result
      end

      def inside_number_or_abbrev?(text, dot_pos)
        prev = dot_pos.positive? ? text[dot_pos - 1] : ''
        nxt = dot_pos + 1 < text.length ? text[dot_pos + 1] : ''
        return true if digit?(prev) && digit?(nxt)

        ABBREVIATIONS.each do |abbrev|
          start = [0, dot_pos + 1 - abbrev.length].max
          return true if text[start...(dot_pos + 1)] == abbrev
        end
        lower?(nxt)
      end

      def push_segment(out, text, start_cp, end_cp, cp_to_u16)
        return if end_cp <= start_cp

        raw = text[start_cp...end_cp]
        stripped = raw.strip
        return if stripped.empty?

        lead = raw.length - raw.lstrip.length
        trail = raw.length - raw.rstrip.length
        out << Sentence.new(
          text: stripped,
          start_offset: cp_to_u16[start_cp + lead],
          end_offset: cp_to_u16[end_cp - trail]
        )
      end

      def digit?(ch)
        !ch.empty? && ch.match?(/[0-9]/)
      end

      # Unicode-aware "is a lowercase letter": has case and is already lower.
      def lower?(ch)
        !ch.empty? && ch != ch.upcase && ch == ch.downcase
      end
    end
  end
end
