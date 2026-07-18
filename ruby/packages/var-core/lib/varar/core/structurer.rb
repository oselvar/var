# frozen_string_literal: true

require 'varar/core/span'
require 'varar/core/ast'

module Varar
  module Core
    # Group scanned blocks into Examples, tracking heading scope and orphan
    # attachments. Port of structurer.ts.
    module Structurer
      module_function

      def structure(path, source, blocks)
        examples = []
        orphan_attachments = []
        scope_stack = [] # [[level, text], ...]
        last_example_idx = -1
        attachment_open = false

        blocks.each do |block|
          case block.kind
          when 'heading'
            # Pop deeper-or-equal-level entries before pushing the new heading.
            scope_stack.pop while !scope_stack.empty? && scope_stack.last[0] >= block.level
            scope_stack << [block.level, block.text]
            attachment_open = false

          when 'paragraph', 'list_item', 'blockquote'
            # Merge a block into the previous example when that example's last
            # block is an attachment (table/fence) with no blank line between.
            if attachment_open && last_example_idx >= 0
              prev = examples[last_example_idx]
              prev_last = prev.body.last
              last_is_attachment = !prev_last.nil? && %w[table fence].include?(prev_last.kind)
              if last_is_attachment
                between = Offsets.utf16_slice(source, prev.span.end_offset, block.span.start_offset)
                unless between.match?(/\n\s*\n/)
                  new_span = Offsets.span_from_offsets(source, prev.span.start_offset, block.span.end_offset)
                  examples[last_example_idx] = Example.new(
                    scope_stack: prev.scope_stack,
                    span: new_span,
                    body: prev.body + [block]
                  )
                  next
                end
              end
            end

            examples << Example.new(
              scope_stack: scope_stack.map { |(_, text)| text },
              span: block.span,
              body: [block]
            )
            last_example_idx = examples.length - 1
            attachment_open = true

          when 'table', 'fence'
            if attachment_open && last_example_idx >= 0
              prev = examples[last_example_idx]
              new_span = Offsets.span_from_offsets(source, prev.span.start_offset, block.span.end_offset)
              examples[last_example_idx] = Example.new(
                scope_stack: prev.scope_stack,
                span: new_span,
                body: prev.body + [block]
              )
            else
              orphan_attachments << block
            end

          when 'thematic_break'
            attachment_open = false
          end
        end

        VarDoc.new(
          path: path,
          source: source,
          examples: examples,
          orphan_attachments: orphan_attachments
        )
      end
    end
  end
end
