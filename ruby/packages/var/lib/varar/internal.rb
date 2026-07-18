# frozen_string_literal: true

require 'varar/core'

module Varar
  # The module-scope step-registration accumulator behind the block DSL
  # `steps(...) do stimulus(...); sensor(...) end`. Mirrors @varar/varar's
  # internal.ts. A step file, when loaded, calls steps() once; the Builder its
  # block registers into these accumulators. The runner/harness then reads
  # them via build_registry / context_factory.
  module Internal
    @steps = []
    @context_factories_by_file = {}
    @custom_types = []

    class << self
      # Register a file's state factory and return a Builder whose
      # stimulus/sensor/param methods accumulate that file's steps. +factory+
      # is a callable (or nil for empty state); +source_file+ keys the
      # per-file context factory. Raises if called twice for one file.
      def register(factory, source_file)
        raise "steps() called more than once in #{source_file}" if @context_factories_by_file.key?(source_file)

        @context_factories_by_file[source_file] = factory || -> { {} }
        Builder.new
      end

      # Accumulate one step. The handler's source_location anchors it to the
      # line the block is written on.
      def add_step(expression, handler, kind)
        file, line = handler.source_location
        @steps << {
          expression: expression, source_file: file, source_line: line,
          handler: handler, kind: kind
        }
        nil
      end

      # Accumulate one custom parameter type.
      def add_custom_type(name, regexp, parse, format)
        @custom_types << { name: name, regexp: regexp, parse: parse, format: format }
        nil
      end

      # (step_file) -> state: invoke the file's factory, or {} if none.
      def context_factory
        factories = @context_factories_by_file.dup
        lambda do |step_file|
          factory = factories[step_file]
          factory ? factory.call : {}
        end
      end

      # Build a Core::Registry: custom parameter types first (so expressions
      # can reference them), then steps in registration order.
      def build_registry
        registry = Core::Registries.create_registry
        @custom_types.each do |type|
          registry = Core::Registries.define_parameter_type(
            registry, name: type[:name], regexp: type[:regexp], parse: type[:parse], format: type[:format]
          )
        end
        @steps.each do |step|
          registry = Core::Registries.add_step(
            registry,
            expression: step[:expression],
            expression_source_file: step[:source_file],
            expression_source_line: step[:source_line],
            handler: step[:handler],
            kind: step[:kind]
          )
        end
        registry
      end

      # Clear all accumulated state (between isolated runs / harness bundles).
      def reset_builder
        @steps = []
        @context_factories_by_file = {}
        @custom_types = []
      end

      # Conformance-harness accessor: custom parameter types projected to the
      # {"name","regexp"} wire shape. `regexp` is the bare source (Regexp#source
      # or the string as authored) — the cross-port convention.
      def custom_parameter_types
        @custom_types.map do |type|
          regexp = type[:regexp]
          regexp = regexp.source if regexp.is_a?(Regexp)
          unless regexp.is_a?(String)
            raise "parameter type #{type[:name].inspect}: regexp arrays are not supported " \
                  'by the conformance projection yet'
          end
          { 'name' => type[:name], 'regexp' => regexp }
        end
      end
    end

    # The block-scoped authoring DSL. A Builder is `instance_eval`-ed with the
    # `steps` block, so authors write bare `stimulus`/`sensor`/`param` calls;
    # each delegates to the accumulator above.
    class Builder
      def stimulus(expression, &handler)
        Internal.add_step(expression, handler, 'stimulus')
      end

      def sensor(expression, &handler)
        Internal.add_step(expression, handler, 'sensor')
      end

      def param(name, regexp, parse: nil, format: nil)
        Internal.add_custom_type(name, regexp, parse, format)
      end
    end
  end
end
