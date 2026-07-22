# frozen_string_literal: true

require 'varar/core/span'
require 'varar/core/cell_diff'
require 'varar/core/doc_string_diff'
require 'varar/core/param_diff'
require 'varar/core/failure_anchor'

module Varar
  module Core
    # Raised when an expected-to-fail example passes unexpectedly.
    class UnexpectedPassError < StandardError
      def initialize(message = 'expected the example to fail, but it passed')
        super
      end
    end

    # Per-step outcome emitted to the optional observer.
    StepObservation = Data.define(:example_name, :example_index, :ordinal, :step_file, :outcome, :error) do
      def initialize(example_name:, example_index:, ordinal:, step_file:, outcome:, error: nil)
        super
      end
    end

    # A named, runnable example returned by collect_examples.
    QueuedExample = Data.define(:name, :run)

    # Execute an ExecutionPlan: route stimulus/sensor returns, replace immutable
    # state, compare sensor returns via the diff helpers, invert expected
    # failures. Handlers are user callbacks (sync). Port of execute.ts.
    module Execute
      module_function

      # Collect all examples into an ordered Array of QueuedExamples.
      def collect_examples(plan, create_context:, observer: nil, reporter: nil)
        queue = []
        sink = ->(name, run, _info) { queue << QueuedExample.new(name: name, run: run) }
        execute_plan(plan, sink: sink, create_context: create_context, observer: observer, reporter: reporter)
        queue
      end

      def execute_plan(plan, sink:, create_context:, observer: nil, reporter: nil)
        plan.diagnostics.each { |d| reporter.call(d) } if reporter
        create_ctx = create_context || ->(_file) { {} }
        var_path = plan.var_doc.path

        plan.examples.each_with_index do |ex, example_index|
          seen_lines = {}
          ex.steps.each { |s| seen_lines[s.match_span.start_line] = true }
          info = { lines: seen_lines.keys }
          sink.call(ex.name, build_run(plan, ex, example_index, create_ctx, observer, var_path), info)
        end
      end

      def build_run(plan, ex, example_index, create_ctx, observer, var_path)
        lambda do
          state_by_file = {}
          last_return = nil
          thrown = nil

          ex.steps.each_with_index do |step, i|
            file = step.step_def.expression_source_file
            state_by_file[file] = create_ctx.call(file) unless state_by_file.key?(file)
            state = state_by_file[file]

            extra = []
            if step.data_table
              extra << ([step.data_table.header.cells] + step.data_table.rows.map(&:cells))
            elsif step.doc_string
              extra << step.doc_string.content
            end

            begin
              returned = step.step_def.handler.call(state, *step.args, *extra)
              last_return = returned
              case step.step_def.kind
              when 'stimulus'
                # Full replacement: the returned Hash IS the next state. There is
                # no merge — a return with fewer keys shrinks the state. nil is a
                # no-op; any other type is a contract violation.
                #
                # The state is the author's own value, handed back untouched: we
                # do not freeze it. Whether it is immutable is the author's call.
                unless returned.nil?
                  unless returned.is_a?(Hash)
                    raise ReturnShapeError,
                          'a stimulus must return the complete next state, ' \
                          'or nothing to leave it unchanged'
                  end

                  state = returned
                  state_by_file[file] = state
                end
              when 'sensor'
                compare_sensor_return(plan, ex, step, returned, extra) if ex.row_checks.nil?
              else
                raise ReturnShapeError, "unknown step kind: #{step.step_def.kind}"
              end
            rescue StandardError => e
              augmented = augment_stack(e, step, var_path)
              observer&.call(observation(ex, example_index, i + 1, file, 'fail', augmented))
              thrown = augmented
              break
            end

            observer&.call(observation(ex, example_index, i + 1, file, 'pass'))
          end

          # Header-bound row checks (after all steps).
          if thrown.nil? && ex.row_checks && !ex.row_checks.empty?
            # Like a slotted sensor, a header-bound row step must answer the row
            # it is bound to: no return means nothing was compared.
            row_error = if last_return.nil?
                          ReturnShapeError.new('a header-bound row step must return a row object ' \
                                               'with one value per bound cell, got nothing')
                        end
            bad = CellDiffs.compare_row(last_return, ex.row_checks).reject(&:ok)
            if row_error || !bad.empty?
              last_step = ex.steps.last
              augmented = augment_stack(row_error || CellMismatchError.new(bad), last_step, var_path)
              observer&.call(observation(ex, example_index, ex.steps.length,
                                         last_step.step_def.expression_source_file, 'fail', augmented))
              thrown = augmented
            end
          end

          # Expected-failure inversion.
          if ex.expected_outcome == 'fail'
            if thrown.nil?
              error = UnexpectedPassError.new
              last = ex.steps.last
              raise(last ? augment_stack(error, last, var_path) : error)
            end
            raise thrown if ex.expected_error_message && !thrown.message.include?(ex.expected_error_message)

            return # satisfied expected-failure → pass
          end

          raise thrown if thrown
        end
      end

      # Sensor slot contract: zero slots + a return is a mistake; one slot IS
      # the return; two+ is a positional array. With one or more slots the
      # return is REQUIRED — returning nothing used to skip the comparison
      # silently, so a typo turned an assertion into a no-op. Raises the
      # appropriate diff error.
      def compare_sensor_return(plan, _ex, step, returned, extra)
        slot_count = step.args.length + extra.length
        if slot_count.zero?
          return if returned.nil?

          raise ReturnShapeError, 'this sensor has no parameters, data table or doc string — ' \
                                  'nothing to compare a return value against (raise to fail, return nothing to pass)'
        end

        if returned.nil?
          raise ReturnShapeError,
                "a sensor with #{slot_count} slot(s) must return one value per slot, got nothing"
        end

        if slot_count == 1
          slots = [returned]
        else
          unless returned.is_a?(Array)
            raise ReturnShapeError,
                  "a sensor with #{slot_count} slots must return a list of " \
                  "#{slot_count} values, got #{returned.class}"
          end
          unless returned.length == slot_count
            raise ReturnShapeError,
                  "sensor return must have #{slot_count} element(s), got #{returned.length}"
          end

          slots = returned
        end

        inline_returned = slots[0...step.args.length]
        source_texts = step.param_spans.map do |s|
          Offsets.utf16_slice(plan.var_doc.source, s.start_offset, s.end_offset)
        end
        param_diffs = ParamDiff.compare_params(inline_returned, step.args, step.param_spans, source_texts,
                                               step.formats).reject(&:ok)
        raise CellMismatchError, param_diffs unless param_diffs.empty?

        if step.data_table
          bad = CellDiffs.compare_table(slots[step.args.length], step.data_table).reject(&:ok)
          raise CellMismatchError, bad unless bad.empty?
        elsif step.doc_string
          diff = DocStringDiffs.compare_doc_string(slots[step.args.length], step.doc_string.content,
                                                   step.doc_string.span)
          raise CellMismatchError, [diff] unless diff.nil?
        end
      end

      def observation(ex, example_index, ordinal, file, outcome, error = nil)
        StepObservation.new(example_name: ex.name, example_index: example_index, ordinal: ordinal,
                            step_file: file, outcome: outcome, error: error)
      end

      # In TS this injects a synthetic `at <text> (path:line:col)` frame for
      # editor navigation; the conformance trace derives the anchor separately
      # via failure_anchor, so here it is a no-op that returns the error.
      def augment_stack(error, _step, _var_path)
        error
      end
    end
  end
end
