# frozen_string_literal: true

require 'varar/core/ast'
require 'varar/core/plan'
require 'varar/core/execute'
require 'varar/core/failure_anchor'

module Varar
  module Core
    # Projections from the internal pipeline values to the camelCase wire
    # dicts compared against golden/*.json. Port of conformance.ts. (var-doc
    # stage; registry/plan/trace projections are added in later stages.)
    module Conformance
      module_function

      def span_hash(span)
        {
          'startOffset' => span.start_offset,
          'endOffset' => span.end_offset,
          'startLine' => span.start_line,
          'startCol' => span.start_col,
          'endLine' => span.end_line,
          'endCol' => span.end_col
        }
      end

      def segment_hash(segment_offset)
        {
          'textOffset' => segment_offset.text_offset,
          'sourceOffset' => segment_offset.source_offset
        }
      end

      def row_hash(row)
        {
          'cells' => row.cells,
          'cellSpans' => row.cell_spans.map { |cs| span_hash(cs) },
          'span' => span_hash(row.span)
        }
      end

      def block_hash(block)
        case block.kind
        when 'paragraph', 'blockquote'
          {
            'kind' => block.kind,
            'text' => block.text,
            'span' => span_hash(block.span),
            'segmentMap' => block.segment_map.map { |so| segment_hash(so) }
          }
        when 'heading'
          {
            'kind' => block.kind,
            'level' => block.level,
            'text' => block.text,
            'span' => span_hash(block.span)
          }
        when 'list_item'
          {
            'kind' => block.kind,
            'text' => block.text,
            'span' => span_hash(block.span),
            'segmentMap' => block.segment_map.map { |so| segment_hash(so) },
            'ordered' => block.ordered,
            'markerSpan' => span_hash(block.marker_span)
          }
        when 'table'
          {
            'kind' => block.kind,
            'span' => span_hash(block.span),
            'header' => row_hash(block.header),
            'rows' => block.rows.map { |r| row_hash(r) }
          }
        when 'fence'
          {
            'kind' => block.kind,
            'span' => span_hash(block.span),
            'info' => block.info,
            'body' => block.body,
            'bodySpan' => span_hash(block.body_span)
          }
        when 'thematic_break'
          {
            'kind' => block.kind,
            'span' => span_hash(block.span)
          }
        else
          raise "Unknown block kind: #{block.kind}"
        end
      end

      def example_hash(example)
        {
          'scopeStack' => example.scope_stack,
          'span' => span_hash(example.span),
          'body' => example.body.map { |b| block_hash(b) },
          'precededByDelimiter' => example.preceded_by_delimiter
        }
      end

      # Project a VarDoc to the wire dict for the var-doc artifact.
      def to_var_doc_artifact(doc)
        {
          'path' => doc.path,
          'examples' => doc.examples.map { |ex| example_hash(ex) },
          'orphanAttachments' => doc.orphan_attachments.map { |b| block_hash(b) }
        }
      end

      # Parameter-type names in source order from a compiled CucumberExpression.
      # The Ruby gem populates @parameter_types in source order during
      # construction (it has no public reader), mirroring the TS AST walk.
      def parameter_type_names(compiled)
        compiled.instance_variable_get(:@parameter_types).map(&:name)
      end

      # Project a Registry to the wire dict for the registry artifact.
      # +parameter_types+ is the custom-type list ({"name","regexp"}).
      def to_registry_artifact(registry, parameter_types = [])
        {
          'steps' => registry.steps.map do |s|
            { 'expression' => s.expression, 'parameterTypeNames' => parameter_type_names(s.compiled) }
          end,
          'parameterTypes' => parameter_types.map do |p|
            { 'name' => p['name'], 'regexp' => p['regexp'] }
          end
        }
      end

      def doc_string_hash(doc_string)
        {
          'content' => doc_string.content,
          'contentType' => doc_string.content_type,
          'span' => span_hash(doc_string.span)
        }
      end

      # Project an ExecutionPlan to the wire dict for the plan artifact.
      def to_plan_artifact(plan)
        source = plan.var_doc.source
        {
          'examples' => plan.examples.map { |ex| planned_example_hash(ex, source) },
          'diagnostics' => plan.diagnostics.map do |d|
            { 'code' => d.code, 'severity' => d.severity, 'span' => span_hash(d.span) }
          end
        }
      end

      def planned_example_hash(example, source)
        result = {
          'name' => example.name,
          'scopeStack' => example.scope_stack,
          'span' => span_hash(example.span),
          'expectedOutcome' => example.expected_outcome || 'pass'
        }
        result['expectedErrorMessage'] = example.expected_error_message if example.expected_error_message
        result['steps'] = example.steps.map { |s| planned_step_hash(s, source) }
        result
      end

      def planned_step_hash(step, source)
        step_names = parameter_type_names(step.step_def.compiled)
        result = {
          'text' => step.text,
          'matchSpan' => span_hash(step.match_span),
          'paramSpans' => step.param_spans.map { |s| span_hash(s) },
          'matchedExpression' => step.step_def.expression,
          'args' => step.param_spans.each_with_index.map do |s, i|
            {
              'value' => Offsets.utf16_slice(source, s.start_offset, s.end_offset),
              'parameterType' => i < step_names.length ? step_names[i] : nil
            }
          end
        }
        result['dataTable'] = block_hash(step.data_table) if step.data_table
        result['docString'] = doc_string_hash(step.doc_string) if step.doc_string
        result
      end

      # Return the file stem: "path/to/foo.steps.rb" -> "foo.steps".
      def file_stem(path)
        File.basename(path, '.*')
      end

      # Project an execution error to a FailureArtifact dict. line and anchor
      # are deterministic source positions (never scraped from a backtrace).
      def to_failure_artifact(error, match_span)
        line = match_span.start_line
        anchor = span_hash(FailureAnchor.failure_anchor(error, match_span))
        case error
        when CellMismatchError
          {
            'kind' => 'cell-mismatch', 'line' => line, 'anchor' => anchor,
            'message' => error.message,
            'cells' => error.cells.reject(&:ok).map do |c|
              { 'column' => c.column, 'expected' => c.expected, 'actual' => c.actual, 'span' => span_hash(c.span) }
            end
          }
        when ReturnShapeError
          { 'kind' => 'return-shape', 'line' => line, 'anchor' => anchor, 'message' => error.message }
        when UnexpectedPassError
          { 'kind' => 'unexpected-pass', 'line' => line, 'anchor' => anchor, 'message' => error.message }
        else
          { 'kind' => 'thrown', 'line' => line, 'anchor' => anchor }
        end
      end

      # Run all examples and return the four-artifact bundle. Port of runConformance.
      def run_conformance(var_doc, registry, create_context, parameter_types = [])
        execution = Plan.plan(var_doc, registry)
        observed = Hash.new { |h, k| h[k] = [] }
        observer = ->(o) { observed[o.example_index] << o }
        queue = Execute.collect_examples(execution, create_context: create_context, observer: observer)

        trace_examples = queue.each_with_index.map do |queued, k|
          outcome = 'pass'
          begin
            queued.run.call
          rescue StandardError
            outcome = 'fail'
          end

          planned = execution.examples[k]
          obs_list = observed[k]
          steps = planned.steps.each_with_index.map do |step, i|
            ordinal = i + 1
            matches = obs_list.select { |x| x.ordinal == ordinal }
            observation = matches.find { |m| m.outcome == 'fail' } || matches.last
            step_outcome = observation ? observation.outcome : 'skipped'
            step_dict = {
              'exampleName' => queued.name,
              'ordinal' => ordinal,
              'stepText' => step.text,
              'matchedExpression' => step.step_def.expression,
              'contextKey' => { 'exampleName' => queued.name,
                                'stepFile' => file_stem(step.step_def.expression_source_file) },
              'outcome' => step_outcome
            }
            step_dict['failure'] = to_failure_artifact(observation&.error, step.match_span) if step_outcome == 'fail'
            step_dict
          end

          { 'name' => queued.name, 'outcome' => outcome, 'steps' => steps }
        end

        {
          var_doc: to_var_doc_artifact(var_doc),
          registry: to_registry_artifact(registry, parameter_types),
          plan: to_plan_artifact(execution),
          trace: { 'examples' => trace_examples }
        }
      end
    end
  end
end
