# frozen_string_literal: true

require 'varar/internal'

module Varar
  # Adapter/harness glue — mirrors the `@varar/varar/registry` subpath.
  # Authors import only `steps` (via varar); runners and the conformance
  # harness reach the accumulator through here.
  module RegistryGlue
    module_function

    def reset_builder
      Internal.reset_builder
    end

    def build_registry
      Internal.build_registry
    end

    def context_factory
      Internal.context_factory
    end

    def custom_parameter_types
      Internal.custom_parameter_types
    end
  end
end
