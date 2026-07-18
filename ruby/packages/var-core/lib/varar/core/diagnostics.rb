# frozen_string_literal: true

module Varar
  module Core
    # A planning/run diagnostic on the shared rail. code is one of
    # "ambiguous-match", "error-fence-without-step", "drift". Port of
    # diagnostics.ts.
    Diagnostic = Data.define(:code, :severity, :message, :span)
    Candidate = Data.define(:expression, :source_file, :source_line)
    AmbiguousInput = Data.define(:text, :span, :candidates)

    module Diagnostics
      module_function

      def ambiguous_match(input)
        lines = input.candidates.map do |c|
          "  '#{c.expression}'    at #{c.source_file}:#{c.source_line}"
        end.join("\n")
        Diagnostic.new(
          severity: 'error',
          code: 'ambiguous-match',
          message: "Ambiguous step: \"#{input.text}\"\nMatched by:\n#{lines}",
          span: input.span
        )
      end

      def drift_detected(name, span)
        Diagnostic.new(
          severity: 'error',
          code: 'drift',
          message: "This paragraph was an example and no longer matches any step (drift): \"#{name}\".\n" \
                   'Fix the step so it matches again, or accept it as prose (run in update mode).',
          span: span
        )
      end

      def error_fence_without_step(span)
        Diagnostic.new(
          severity: 'error',
          code: 'error-fence-without-step',
          message: 'This `error` fence marks the example as expected-to-fail, ' \
                   'but the example has no step to run.',
          span: span
        )
      end
    end
  end
end
