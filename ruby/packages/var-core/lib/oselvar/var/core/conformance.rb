# frozen_string_literal: true

require "oselvar/var/core/ast"

module Oselvar
  module Var
    module Core
      # Projections from the internal pipeline values to the camelCase wire
      # dicts compared against golden/*.json. Port of conformance.ts. (var-doc
      # stage; registry/plan/trace projections are added in later stages.)
      module Conformance
        module_function

        def span_hash(span)
          {
            "startOffset" => span.start_offset,
            "endOffset" => span.end_offset,
            "startLine" => span.start_line,
            "startCol" => span.start_col,
            "endLine" => span.end_line,
            "endCol" => span.end_col
          }
        end

        def segment_hash(segment_offset)
          {
            "textOffset" => segment_offset.text_offset,
            "sourceOffset" => segment_offset.source_offset
          }
        end

        def row_hash(row)
          {
            "cells" => row.cells,
            "cellSpans" => row.cell_spans.map { |cs| span_hash(cs) },
            "span" => span_hash(row.span)
          }
        end

        def block_hash(block)
          case block.kind
          when "paragraph"
            {
              "kind" => block.kind,
              "text" => block.text,
              "span" => span_hash(block.span),
              "segmentMap" => block.segment_map.map { |so| segment_hash(so) }
            }
          when "heading"
            {
              "kind" => block.kind,
              "level" => block.level,
              "text" => block.text,
              "span" => span_hash(block.span)
            }
          when "list_item"
            {
              "kind" => block.kind,
              "text" => block.text,
              "span" => span_hash(block.span),
              "segmentMap" => block.segment_map.map { |so| segment_hash(so) },
              "ordered" => block.ordered,
              "markerSpan" => span_hash(block.marker_span)
            }
          when "blockquote"
            {
              "kind" => block.kind,
              "text" => block.text,
              "span" => span_hash(block.span),
              "segmentMap" => block.segment_map.map { |so| segment_hash(so) }
            }
          when "table"
            {
              "kind" => block.kind,
              "span" => span_hash(block.span),
              "header" => row_hash(block.header),
              "rows" => block.rows.map { |r| row_hash(r) }
            }
          when "fence"
            {
              "kind" => block.kind,
              "span" => span_hash(block.span),
              "info" => block.info,
              "body" => block.body,
              "bodySpan" => span_hash(block.body_span)
            }
          when "thematic_break"
            {
              "kind" => block.kind,
              "span" => span_hash(block.span)
            }
          else
            raise "Unknown block kind: #{block.kind}"
          end
        end

        def example_hash(example)
          {
            "scopeStack" => example.scope_stack,
            "span" => span_hash(example.span),
            "body" => example.body.map { |b| block_hash(b) }
          }
        end

        # Project a VarDoc to the wire dict for the var-doc artifact.
        def to_var_doc_artifact(doc)
          {
            "path" => doc.path,
            "examples" => doc.examples.map { |ex| example_hash(ex) },
            "orphanAttachments" => doc.orphan_attachments.map { |b| block_hash(b) }
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
            "steps" => registry.steps.map do |s|
              { "expression" => s.expression, "parameterTypeNames" => parameter_type_names(s.compiled) }
            end,
            "parameterTypes" => parameter_types.map do |p|
              { "name" => p["name"], "regexp" => p["regexp"] }
            end
          }
        end
      end
    end
  end
end
