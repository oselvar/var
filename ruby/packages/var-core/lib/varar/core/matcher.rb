# frozen_string_literal: true

require 'varar/core/span'

module Varar
  module Core
    # UTF-16 start/end of one captured parameter within a sentence.
    ParamSpan = Data.define(:start, :end)
    # One successful expression match inside a sentence. Offsets are UTF-16.
    Hit = Data.define(:expression, :step_def, :match_start, :match_end, :args, :param_spans, :formats) do
      def initialize(expression:, step_def:, match_start:, match_end:, args:, param_spans:, formats: [])
        super
      end
    end
    # Two or more hits starting at the same position with equal length.
    AmbiguityCollision = Data.define(:match_start, :match_end, :candidates)
    # Tagged result of resolve_hits: kind "ok" (steps) or "ambiguous" (collisions).
    ResolvedSteps = Data.define(:kind, :steps, :collisions) do
      def initialize(kind:, steps: [], collisions: [])
        super
      end
    end

    # Cucumber-expression matching. Port of matcher.ts. cucumber-expressions'
    # regexps are anchored (^...$) and its group offsets are code-point based,
    # so we strip anchors for substring search and convert offsets to UTF-16.
    module Matcher
      module_function

      # A compiled, un-anchored pattern from the step's CucumberExpression.
      def unanchored_pattern(step)
        regexp = step.compiled.instance_variable_get(:@tree_regexp).regexp
        source = regexp.source
        source = source[1..] if source.start_with?('^')
        source = source[0...-1] if source.end_with?('$')
        Regexp.new(source, regexp.options)
      end

      # Every expression match found anywhere in +sentence+.
      def find_hits(sentence, registry)
        hits = []
        registry.steps.each do |step|
          pattern = unanchored_pattern(step)
          pos = 0
          while pos <= sentence.length
            m = pattern.match(sentence, pos)
            break if m.nil?

            matched_text = m[0]
            arguments = step.compiled.match(matched_text) || []
            args = arguments.map { |arg| arg.value(nil) }
            formats = arguments.map { |arg| registry.formats[arg.parameter_type.name] }

            # group.start/.end are code-point offsets within matched_text; add
            # m.begin(0) for the sentence-absolute code-point index, then to UTF-16.
            param_spans = arguments.filter_map do |arg|
              g = arg.group
              next unless g.start.is_a?(Integer) && g.end.is_a?(Integer)

              ParamSpan.new(
                start: Offsets.to_utf16_offset(sentence, m.begin(0) + g.start),
                end: Offsets.to_utf16_offset(sentence, m.begin(0) + g.end)
              )
            end

            hits << Hit.new(
              expression: step.expression,
              step_def: step,
              match_start: Offsets.to_utf16_offset(sentence, m.begin(0)),
              match_end: Offsets.to_utf16_offset(sentence, m.end(0)),
              args: args,
              param_spans: param_spans,
              formats: formats
            )

            pos = matched_text.empty? ? m.begin(0) + 1 : m.end(0)
          end
        end
        hits
      end

      # Select the best non-overlapping hits, or report ambiguities.
      def resolve_hits(hits)
        return ResolvedSteps.new(kind: 'ok') if hits.empty?

        # Stable sort by (match_start asc, length desc); the original index
        # breaks ties so equal-key order follows registration order (Ruby's
        # sort_by is not stable, Python's sorted is).
        sorted = hits.each_with_index.sort_by do |h, i|
          [h.match_start, -(h.match_end - h.match_start), i]
        end.map(&:first)

        collisions = []
        i = 0
        while i < sorted.length
          here = sorted[i]
          here_len = here.match_end - here.match_start
          tied = [here]
          j = i + 1
          while j < sorted.length
            candidate = sorted[j]
            if candidate.match_start == here.match_start &&
               candidate.match_end - candidate.match_start == here_len
              tied << candidate
              j += 1
            else
              break
            end
          end
          if tied.length > 1
            collisions << AmbiguityCollision.new(
              match_start: here.match_start, match_end: here.match_end, candidates: tied
            )
          end
          i = j
        end

        return ResolvedSteps.new(kind: 'ambiguous', collisions: collisions) unless collisions.empty?

        steps = []
        cursor = -1
        sorted.each do |hit|
          next if hit.match_start < cursor

          steps << hit
          cursor = hit.match_end
        end
        ResolvedSteps.new(kind: 'ok', steps: steps)
      end
    end
  end
end
