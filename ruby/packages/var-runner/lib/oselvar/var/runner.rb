# frozen_string_literal: true

require "oselvar/var"
require "oselvar/var/config"
require "oselvar/var/core"

module Oselvar
  module Var
    # The imperative shell: discovery, step loading, planning, failure
    # rendering, and the filesystem drift baseline store. Depends on the facade
    # and config; never on a test framework. Port of var-runner.
    module Runner
      VERSION = "0.3.2"
    end
  end
end

require "oselvar/var/runner/discovery"
require "oselvar/var/runner/steps"
require "oselvar/var/runner/run"
require "oselvar/var/runner/render"
require "oselvar/var/runner/baseline_store"
