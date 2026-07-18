# frozen_string_literal: true

require 'varar/core/cell_diff'
require 'varar/core/doc_string_diff'

module Varar
  module Core
    # Where a failure points in the .md source: a mismatch anchors at its first
    # failing span (cell / doc-string body), anything else at the fallback (the
    # step's match span). The single source of truth for failure locations,
    # pinned as failure.anchor in the conformance trace. Port of failure-anchor.ts.
    module FailureAnchor
      module_function

      def failure_anchor(error, fallback)
        case error
        when CellMismatchError
          failing = error.cells.find { |c| !c.ok }
          failing ? failing.span : fallback
        when DocStringMismatchError
          error.diff.span
        else
          fallback
        end
      end
    end
  end
end
