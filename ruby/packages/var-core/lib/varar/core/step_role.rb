# frozen_string_literal: true

module Varar
  module Core
    # The role a step definition plays:
    #   "stimulus" — drives the software (arranges and acts on state)
    #   "sensor"   — the read-only assertion (the only role that returns for
    #                comparison)
    # Purely structural — never inspects sentence words (no Given/When/Then
    # heuristics). Port of step-role.ts.
    module StepRole
      module_function

      # Guess a step's role from its document-order neighbours. A step with
      # nothing after it is most likely the observation; anything followed by
      # other steps is most likely driving the software.
      def infer_step_role(neighbours)
        after = neighbours[:after] || neighbours['after'] || []
        after.empty? ? 'sensor' : 'stimulus'
      end
    end
  end
end
