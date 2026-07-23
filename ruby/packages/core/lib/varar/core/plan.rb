# frozen_string_literal: true

require 'varar/core/span'
require 'varar/core/ast'
require 'varar/core/cell_diff'
require 'varar/core/diagnostics'
require 'varar/core/matcher'
require 'varar/core/sentences'

module Varar
  module Core
    DocString = Data.define(:content, :content_type, :span)

    PlannedStep = Data.define(:text, :match_span, :param_spans, :step_def, :args, :formats, :data_table,
                              :doc_string) do
      def initialize(text:, match_span:, param_spans:, step_def:, args:, formats: [], data_table: nil,
                     doc_string: nil)
        super
      end
    end

    HeaderBinding = Data.define(:match_span, :param_spans, :step_def)

    PlannedExample = Data.define(:name, :scope_stack, :span, :steps, :header_binding, :row_checks,
                                 :expected_outcome, :expected_error_message) do
      def initialize(name:, scope_stack:, span:, steps:, header_binding: nil, row_checks: nil,
                     expected_outcome: nil, expected_error_message: nil)
        super
      end
    end

    ExecutionPlan = Data.define(:var_doc, :examples, :diagnostics)

    # Produce an ExecutionPlan from a VarDoc + Registry: match step expressions
    # against every text block, attach trailing tables/fences, detect
    # header-bound tables, and collect diagnostics. Port of plan.ts.
    module Plan
      BlockPlan = Data.define(:steps, :ambiguities)
      Ambiguity = Data.define(:match_start, :match_end, :candidates)

      # A candidate paragraph, planned in isolation (Phase 1). Either a
      # header-bound table (standalone rows) or a step-bearing candidate the
      # grouping pass may merge into an open example.
      HeaderBoundUnit = Data.define(:rows)
      StepsUnit = Data.define(:matched, :preceded_by_delimiter, :name, :scope_stack, :span, :steps,
                              :expected_outcome, :expected_error_message)

      # An open, merging example being built up across adjacent matching
      # candidates in Phase 2.
      MergedExample = Struct.new(:name, :scope_stack, :start_offset, :end_offset, :steps,
                                 :expected_outcome, :expected_error_message)

      module_function

      def plan(var_doc, registry)
        diagnostics = []

        # Phase 1: plan each candidate paragraph independently into a "unit".
        units = var_doc.examples.map { |ex| plan_candidate(ex, var_doc, registry, diagnostics) }

        # Phase 2: group adjacent candidates into examples. A matching candidate
        # continues the open example when no delimiter (heading / `---`) precedes
        # it; otherwise it starts a new one. A non-matching candidate (prose) is
        # a delimiter: it closes the open example and is dropped. A header-bound
        # table candidate is standalone — one example per row. See ADR 0012.
        examples = []
        open = nil
        flush = lambda do
          examples << finish_merged(open, var_doc.source) if open
          open = nil
        end
        units.each do |unit|
          if unit.is_a?(HeaderBoundUnit)
            flush.call
            examples.concat(unit.rows)
            next
          end
          unless unit.matched
            # Prose paragraph — a delimiter. Drop it and end the open example.
            flush.call
            next
          end
          if open && !unit.preceded_by_delimiter
            merge_into(open, unit)
          else
            flush.call
            open = start_merged(unit)
          end
        end
        flush.call

        ExecutionPlan.new(var_doc: var_doc, examples: examples, diagnostics: diagnostics)
      end

      def start_merged(unit)
        MergedExample.new(unit.name, unit.scope_stack, unit.span.start_offset, unit.span.end_offset,
                          unit.steps.dup, unit.expected_outcome, unit.expected_error_message)
      end

      def merge_into(open, unit)
        open.end_offset = unit.span.end_offset
        open.steps.concat(unit.steps)
        # Any error fence in a merged part marks the whole example
        # expected-to-fail; keep the first message we see.
        return unless unit.expected_outcome == 'fail'

        open.expected_outcome = 'fail'
        return unless open.expected_error_message.nil? && !unit.expected_error_message.nil?

        open.expected_error_message = unit.expected_error_message
      end

      def finish_merged(open, source)
        span = Offsets.span_from_offsets(source, open.start_offset, open.end_offset)
        PlannedExample.new(
          name: open.name,
          scope_stack: open.scope_stack,
          span: span,
          steps: open.steps,
          expected_outcome: open.expected_outcome,
          expected_error_message: open.expected_error_message
        )
      end

      # Plan a single candidate paragraph (plus attached tables/fences) in
      # isolation. Emits ambiguity / error-fence diagnostics into +diagnostics+.
      def plan_candidate(ex, var_doc, registry, diagnostics)
        had_ambiguous = false
        steps_by_block = {}

        # Pass 1: plan each text-bearing block.
        ex.body.each_with_index do |block, idx|
          next unless %w[paragraph list_item blockquote].include?(block.kind)

          result = plan_block(block.text, registry)

          result.ambiguities.each do |collision|
            span = lift_span(var_doc.source, block, collision.match_start, collision.match_end)
            cp_start = Offsets.cp_index_for_utf16(block.text, collision.match_start)
            cp_end = Offsets.cp_index_for_utf16(block.text, collision.match_end)
            diagnostics << Diagnostics.ambiguous_match(
              AmbiguousInput.new(
                text: block.text[cp_start...cp_end],
                span: span,
                candidates: collision.candidates.map do |c|
                  Candidate.new(
                    expression: c.expression,
                    source_file: c.step_def.expression_source_file,
                    source_line: c.step_def.expression_source_line
                  )
                end
              )
            )
            had_ambiguous = true
          end

          next unless !had_ambiguous && !result.steps.empty?

          steps_by_block[idx] = result.steps.map do |hit|
            PlannedStep.new(
              text: Offsets.utf16_slice(block.text, hit.match_start, hit.match_end),
              match_span: lift_span(var_doc.source, block, hit.match_start, hit.match_end),
              param_spans: hit.param_spans.map { |p| lift_span(var_doc.source, block, p.start, p.end) },
              step_def: hit.step_def,
              args: hit.args,
              formats: hit.formats
            )
          end
        end

        # Header-bound table detection.
        bound = had_ambiguous ? nil : detect_header_bound(ex, steps_by_block, var_doc.source)
        if bound
          table, binding_step, header_spans = bound
          header_binding = HeaderBinding.new(
            match_span: binding_step.match_span,
            param_spans: header_spans,
            step_def: binding_step.step_def
          )
          rows = table.rows.map do |row|
            row_object = {}
            table.header.cells.each_with_index do |cell_name, i|
              row_object[cell_name] = i < row.cells.length ? row.cells[i] : ''
            end
            row_step = PlannedStep.new(
              text: binding_step.text,
              match_span: row.span,
              param_spans: binding_step.param_spans,
              step_def: binding_step.step_def,
              args: binding_step.args + [row_object],
              formats: binding_step.formats
            )
            row_checks = table.header.cells.each_with_index.map do |cell_name, i|
              RowCheck.new(
                column: cell_name,
                value: i < row.cells.length ? row.cells[i] : '',
                span: i < row.cell_spans.length ? row.cell_spans[i] : row.span
              )
            end
            PlannedExample.new(
              name: row.cells.join(' / '),
              scope_stack: ex.scope_stack + [binding_step.text],
              span: row.span,
              steps: [row_step],
              header_binding: header_binding,
              row_checks: row_checks
            )
          end
          return HeaderBoundUnit.new(rows: rows)
        end

        # Error fence detection.
        error_fence = ex.body.find { |b| b.kind == 'fence' && b.info == 'error' }

        # Pass 2: attach trailing table / fence to the last step of a block.
        attachments = {}
        (1...ex.body.length).each do |idx|
          here = ex.body[idx]
          if here.kind == 'table' && steps_by_block.key?(idx - 1)
            _prev_data, prev_doc = attachments[idx - 1] || [nil, nil]
            attachments[idx - 1] = [here, prev_doc]
          elsif here.kind == 'fence' && here.info != 'error' && steps_by_block.key?(idx - 1)
            prev_data, = attachments[idx - 1] || [nil, nil]
            attachments[idx - 1] = [
              prev_data,
              DocString.new(content: here.body, content_type: here.info, span: here.body_span)
            ]
          end
        end

        # Pass 3: rebuild the final step list, applying attachments.
        final_steps = []
        (0...ex.body.length).each do |idx|
          block_steps = steps_by_block[idx] || []
          attach = attachments[idx]
          block_steps.each_with_index do |step, s_idx|
            if s_idx == block_steps.length - 1 && attach
              data_table, doc_string = attach
              final_steps << PlannedStep.new(
                text: step.text, match_span: step.match_span, param_spans: step.param_spans,
                step_def: step.step_def, args: step.args, formats: step.formats,
                data_table: data_table, doc_string: doc_string
              )
            else
              final_steps << step
            end
          end
        end

        runnable_steps = had_ambiguous ? [] : final_steps

        diagnostics << Diagnostics.error_fence_without_step(error_fence.span) if error_fence && runnable_steps.empty?

        expected_outcome = nil
        expected_error_message = nil
        if error_fence
          expected_outcome = 'fail'
          msg = error_fence.body.strip
          expected_error_message = msg unless msg.empty?
        end

        StepsUnit.new(
          matched: !runnable_steps.empty?,
          preceded_by_delimiter: ex.preceded_by_delimiter,
          name: derive_example_name(ex.body),
          scope_stack: ex.scope_stack,
          span: ex.span,
          steps: runnable_steps,
          expected_outcome: expected_outcome,
          expected_error_message: expected_error_message
        )
      end

      def plan_block(text, registry)
        all_steps = []
        all_ambiguities = []

        Sentences.split_sentences(text).each do |sentence|
          hits = Matcher.find_hits(sentence.text, registry)
          adjusted = hits.map do |h|
            Hit.new(
              expression: h.expression,
              step_def: h.step_def,
              match_start: h.match_start + sentence.start_offset,
              match_end: h.match_end + sentence.start_offset,
              args: h.args,
              param_spans: h.param_spans.map do |p|
                ParamSpan.new(start: p.start + sentence.start_offset, end: p.end + sentence.start_offset)
              end,
              formats: h.formats
            )
          end
          resolved = Matcher.resolve_hits(adjusted)
          if resolved.kind == 'ambiguous'
            resolved.collisions.each do |c|
              all_ambiguities << Ambiguity.new(match_start: c.match_start, match_end: c.match_end,
                                               candidates: c.candidates)
            end
          elsif !resolved.steps.empty?
            all_steps.concat(resolved.steps)
          end
        end

        BlockPlan.new(steps: all_steps, ambiguities: all_ambiguities)
      end

      # Whole-word, case-sensitive start index of +word+ in +haystack+, or nil.
      def word_offset(haystack, word)
        m = /(?<![^\W_])#{Regexp.escape(word)}(?![^\W_])/.match(haystack)
        m&.begin(0)
      end

      def detect_header_bound(ex, steps_by_block, source)
        body = ex.body
        (1...body.length).each do |idx|
          here = body[idx]
          next unless here.kind == 'table'

          above = body[idx - 1]
          next unless %w[paragraph list_item blockquote].include?(above.kind)

          steps = steps_by_block[idx - 1]
          next if steps.nil? || steps.empty?

          header_cells = here.header.cells
          offsets = header_cells.map { |cell| word_offset(above.text, cell) }
          next if offsets.any?(&:nil?)

          utf16_offsets = offsets.map { |o| Offsets.to_utf16_offset(above.text, o) }
          header_spans = header_cells.each_index.map do |i|
            lift_span(source, above, utf16_offsets[i], utf16_offsets[i] + Offsets.utf16_len(header_cells[i]))
          end
          return [here, steps.last, header_spans]
        end
        nil
      end

      def derive_example_name(body)
        primary = body.find { |b| %w[paragraph list_item blockquote].include?(b.kind) }
        return '' if primary.nil?

        name = primary.text.gsub(/\s+/, ' ').strip
        name.sub(/[.!?]$/, '')
      end

      def lift_segment_offset(segment_map, text_offset)
        best = segment_map.first
        segment_map.each { |entry| best = entry if entry.text_offset <= text_offset }
        raise 'empty segment_map' if best.nil?

        best.source_offset + (text_offset - best.text_offset)
      end

      def lift_span(source, block, block_start, block_end)
        return block.span unless %w[paragraph list_item blockquote].include?(block.kind)

        start_src = lift_segment_offset(block.segment_map, block_start)
        end_src = lift_segment_offset(block.segment_map, block_end)
        Offsets.span_from_offsets(source, start_src, end_src)
      end
    end
  end
end
