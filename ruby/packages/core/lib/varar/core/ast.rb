# frozen_string_literal: true

require 'varar/core/span'

module Varar
  module Core
    # Maps a block-text offset to its source offset. Block text is the raw
    # source minus BLOCK markers only (list bullets, blockquote `>` prefixes);
    # inline markup is never stripped. A paragraph/list item has a single
    # entry; a blockquote one entry per quoted line.
    SegmentOffset = Data.define(:text_offset, :source_offset)

    Heading = Data.define(:level, :text, :span) do
      def kind = 'heading'
    end

    Paragraph = Data.define(:text, :span, :segment_map) do
      def kind = 'paragraph'
    end

    ListItem = Data.define(:text, :span, :segment_map, :ordered, :marker_span) do
      def kind = 'list_item'
    end

    Blockquote = Data.define(:text, :span, :segment_map) do
      def kind = 'blockquote'
    end

    Row = Data.define(:cells, :cell_spans, :span)

    Table = Data.define(:span, :header, :rows) do
      def kind = 'table'
    end

    Fence = Data.define(:span, :info, :body, :body_span) do
      def kind = 'fence'
    end

    ThematicBreak = Data.define(:span) do
      def kind = 'thematic_break'
    end

    # +preceded_by_delimiter+ is true when a heading or thematic break (`---`)
    # sits between this candidate and the previous one (also true for the first
    # candidate). The planner uses it to group adjacent matching candidates into
    # one example. See ADR 0012.
    Example = Data.define(:scope_stack, :span, :body, :preceded_by_delimiter)

    VarDoc = Data.define(:path, :source, :examples, :orphan_attachments)
  end
end
