# frozen_string_literal: true

require 'varar'
require 'varar/config'
require 'varar/core'

module Varar
  # The imperative shell: discovery, step loading, planning, failure
  # rendering, and the filesystem drift baseline store. Depends on the facade
  # and config; never on a test framework. Port of var-runner.
  module Runner
    VERSION = '0.4.2'
  end
end

require 'varar/runner/discovery'
require 'varar/runner/steps'
require 'varar/runner/run'
require 'varar/runner/render'
require 'varar/runner/baseline_store'
