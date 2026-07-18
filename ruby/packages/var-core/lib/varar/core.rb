# frozen_string_literal: true

module Varar
  # The pure functional core: parse, match, plan, execute, diffs, drift, and
  # the conformance projections. No filesystem, network, globals, or time.
  module Core
    VERSION = '0.4.2'
  end
end

require 'varar/core/span'
require 'varar/core/ast'
require 'varar/core/table_cells'
require 'varar/core/scanner'
require 'varar/core/structurer'
require 'varar/core/parse'
require 'varar/core/step_role'
require 'varar/core/registry'
require 'varar/core/sentences'
require 'varar/core/diagnostics'
require 'varar/core/cell_diff'
require 'varar/core/matcher'
require 'varar/core/plan'
require 'varar/core/deep_freeze'
require 'varar/core/doc_string_diff'
require 'varar/core/param_diff'
require 'varar/core/failure_anchor'
require 'varar/core/execute'
require 'varar/core/hash'
require 'varar/core/drift'
require 'varar/core/canonical_json'
require 'varar/core/conformance'
