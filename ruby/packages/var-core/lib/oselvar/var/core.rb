# frozen_string_literal: true

module Oselvar
  module Var
    # The pure functional core: parse, match, plan, execute, diffs, drift, and
    # the conformance projections. No filesystem, network, globals, or time.
    module Core
      VERSION = "0.3.2"
    end
  end
end

require "oselvar/var/core/span"
require "oselvar/var/core/ast"
require "oselvar/var/core/table_cells"
require "oselvar/var/core/scanner"
require "oselvar/var/core/structurer"
require "oselvar/var/core/parse"
require "oselvar/var/core/step_role"
require "oselvar/var/core/registry"
require "oselvar/var/core/canonical_json"
require "oselvar/var/core/conformance"
