# frozen_string_literal: true

require 'minitest'
require 'varar/runner'

module Varar
  # Minitest adapter. One call turns every spec matched by varar.config.json into
  # a generated Minitest::Test subclass — one class per spec file, one test
  # method per example. Mirrors var-unittest.
  #
  #   # test/var_test.rb
  #   require "varar/minitest"
  #   Varar::Minitest.generate_tests
  module Minitest
    VERSION = '0.6.1'

    module_function

    def generate_tests(namespace = Object, root: nil)
      root ||= File.dirname(caller_locations(1, 1).first.path)
      root = File.expand_path(root)
      cfg = Config.read_var_config(root)
      loaded = Runner.load_steps(cfg.steps, root)
      store = Runner.create_file_baseline_store(root)
      update = %w[1 true].include?(ENV.fetch('VARAR_UPDATE', nil))

      Runner.find_specs(cfg.docs_include, cfg.docs_exclude, root).each do |spec_path|
        klass = build_test_case(spec_path, root, loaded, store, update)
        namespace.const_set("Var_#{identifier(Runner.rel_posix(spec_path, root))}", klass)
      end
    end

    def build_test_case(spec_path, root, loaded, store, update)
      rel = Runner.rel_posix(spec_path, root)
      source = File.read(spec_path, encoding: 'UTF-8')
      plan = Runner.plan_spec(File.basename(spec_path), source, loaded.registry)
      pairs = Runner.examples_with_runs(plan, loaded.create_context, Runner::RecordingReporter.new)

      klass = Class.new(::Minitest::Test)
      seen = Hash.new(0)
      pairs.each do |example, run|
        base = example.scope_stack.last || example.name
        stem = identifier(base)
        idx = seen[stem]
        seen[stem] += 1
        method_name = idx.zero? ? "test_#{stem}" : "test_#{stem}_#{idx}"
        klass.define_method(method_name) do
          run.call
        rescue StandardError => e
          raise ::Minitest::Assertion, Runner.render_failure(e, source, rel) if Minitest.var_diff_error?(e)

          raise
        end
      end

      Core::Drifts.reconcile_drift(store, rel, source, plan.var_doc, plan, update: update).each do |drift|
        message = Core::Diagnostics.drift_detected(drift.name, drift.span).message
        klass.define_method("test_var_drift_#{drift.line}") { raise ::Minitest::Assertion, message }
      end

      klass
    end

    # A markdown/return mismatch is a test failure (Minitest::Assertion); any
    # other exception propagates as an error.
    def var_diff_error?(error)
      error.is_a?(Core::CellMismatchError) ||
        error.is_a?(Core::ReturnShapeError) || error.is_a?(Core::UnexpectedPassError)
    end

    # Project arbitrary text onto a valid identifier fragment.
    def identifier(text)
      ident = text.gsub(/\W+/, '_').gsub(/\A_+|_+\z/, '')
      ident = 'example' if ident.empty?
      ident = "_#{ident}" if ident.match?(/\A\d/)
      ident
    end
  end
end
