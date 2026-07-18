# frozen_string_literal: true

require 'varar'
require 'varar/registry'

module Varar
  module Runner
    # The registry + per-file context factory built from loaded step files.
    LoadedSteps = Data.define(:registry, :create_context)

    module_function

    # Reset the accumulator, load (execute) every step file matching
    # +step_globs+ under +root+, and build the registry + context factory.
    def load_steps(step_globs, root)
      RegistryGlue.reset_builder
      files = []
      step_globs.each do |g|
        files.concat(Dir.glob(g, base: root).map { |rel| File.join(root, rel) })
      end
      files.select { |p| File.file?(p) }.uniq.sort.each { |path| load path }
      LoadedSteps.new(registry: RegistryGlue.build_registry, create_context: RegistryGlue.context_factory)
    end
  end
end
