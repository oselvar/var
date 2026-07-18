# frozen_string_literal: true

require 'spec_helper'
require 'varar/core'

module Varar
  module Core
    # Translated from typescript/packages/var-core/tests/span.test.ts and
    # python/packages/var-core/tests/test_span.py.
    ::RSpec.describe Offsets do
      describe '.utf16_len' do
        it 'counts ASCII, BMP, and astral characters in UTF-16 units' do
          expect(described_class.utf16_len('abc')).to eq(3)
          expect(described_class.utf16_len('é')).to eq(1)   # BMP: 1 code unit
          expect(described_class.utf16_len('😀')).to eq(2)   # astral: surrogate pair
          expect(described_class.utf16_len('a😀b')).to eq(4)
        end
      end

      describe '.to_utf16_offset' do
        it 'counts UTF-16 units before a code-point index' do
          s = 'a😀b' # cp indices: a=0 😀=1 b=2
          expect(described_class.to_utf16_offset(s, 0)).to eq(0)
          expect(described_class.to_utf16_offset(s, 1)).to eq(1) # after "a"
          expect(described_class.to_utf16_offset(s, 2)).to eq(3) # after "a😀" (1+2)
        end
      end

      describe '.utf16_slice' do
        it 'round-trips through UTF-16 units' do
          s = 'x😀y' # u16: x=0 😀=1..3 y=3
          expect(described_class.utf16_slice(s, 0, 1)).to eq('x')
          expect(described_class.utf16_slice(s, 1, 3)).to eq('😀')
          expect(described_class.utf16_slice(s, 3, 4)).to eq('y')
        end
      end

      describe '.line_col' do
        it 'counts UTF-16 units, resetting column after a newline' do
          s = "ab\n😀x" # u16 offsets: a0 b1 \n2 😀3-4 x5
          expect(described_class.line_col(s, 1)).to eq([1, 2])
          expect(described_class.line_col(s, 5)).to eq([2, 3]) # astral counts as 2
        end
      end

      describe '.span_from_offsets' do
        it 'computes line and column for a single-line source' do
          span = described_class.span_from_offsets('hello world', 6, 11)
          expect(span).to eq(Span.new(
                               start_offset: 6, end_offset: 11,
                               start_line: 1, start_col: 7,
                               end_line: 1, end_col: 12
                             ))
        end

        it 'handles multi-line sources' do
          source = "line one\nline two\nline three"
          span = described_class.span_from_offsets(source, 14, 17) # 'two'
          expect(span).to eq(Span.new(
                               start_offset: 14, end_offset: 17,
                               start_line: 2, start_col: 6,
                               end_line: 2, end_col: 9
                             ))
        end

        it 'handles a range crossing a newline' do
          span = described_class.span_from_offsets("ab\ncd", 1, 4) # 'b'..'d'
          expect(span).to eq(Span.new(
                               start_offset: 1, end_offset: 4,
                               start_line: 1, start_col: 2,
                               end_line: 2, end_col: 2
                             ))
        end
      end
    end
  end
end
