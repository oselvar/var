# frozen_string_literal: true

require 'varar/core/span'
require 'varar/core/ast'

module Varar
  module Core
    # Group scanned blocks into candidate Examples, tracking heading scope and
    # orphan attachments. This is pure syntax — it does NOT decide where one
    # example ends and the next begins. Each candidate records
    # +preceded_by_delimiter+ (a heading or `---` sits before it) and the planner
    # groups adjacent matching candidates into examples. Port of structurer.ts.
    # See ADR 0012.
    module Structurer
      module_function

      def structure(path, source, blocks)
        examples = []
        orphan_attachments = []
        scope_stack = [] # [[level, text], ...]
        last_example_idx = -1
        attachment_open = false
        # A heading or thematic break seen since the previous candidate — the
        # next candidate is then delimiter-preceded. Starts true so the first
        # candidate in the file counts as delimiter-preceded (nothing to merge
        # into).
        delimiter_pending = true

        blocks.each do |block|
          case block.kind
          when 'heading'
            # Pop deeper-or-equal-level entries before pushing the new heading.
            scope_stack.pop while !scope_stack.empty? && scope_stack.last[0] >= block.level
            scope_stack << [block.level, block.text]
            attachment_open = false
            delimiter_pending = true

          when 'paragraph', 'list_item', 'blockquote'
            examples << Example.new(
              scope_stack: scope_stack.map { |(_, text)| text },
              span: block.span,
              body: [block],
              preceded_by_delimiter: delimiter_pending
            )
            last_example_idx = examples.length - 1
            attachment_open = true
            delimiter_pending = false

          when 'table', 'fence'
            if attachment_open && last_example_idx >= 0
              prev = examples[last_example_idx]
              new_span = Offsets.span_from_offsets(source, prev.span.start_offset, block.span.end_offset)
              examples[last_example_idx] = Example.new(
                scope_stack: prev.scope_stack,
                span: new_span,
                body: prev.body + [block],
                preceded_by_delimiter: prev.preceded_by_delimiter
              )
            else
              orphan_attachments << block
            end

          when 'thematic_break'
            attachment_open = false
            delimiter_pending = true
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
