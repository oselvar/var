# frozen_string_literal: true

require 'varar/core'

module Varar
  module Runner
    # Collects diagnostics emitted during planning/execution.
    class RecordingReporter
      attr_reader :diagnostics

      def initialize
        @diagnostics = []
      end

      def diagnostic(diagnostic)
        @diagnostics << diagnostic
      end
    end

    module_function

    def plan_spec(path, source, registry)
      Core::Plan.plan(Core::Parse.parse(path, source), registry)
    end

    # Pair each PlannedExample with its lazy run closure, in plan order.
    def examples_with_runs(execution_plan, create_context, reporter)
      reporter_cb = ->(d) { reporter.diagnostic(d) }
      queue = Core::Execute.collect_examples(execution_plan, create_context: create_context, reporter: reporter_cb)
      execution_plan.examples.zip(queue).map { |example, queued| [example, queued.run] }
    end
  end
end
