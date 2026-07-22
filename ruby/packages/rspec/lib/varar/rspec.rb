# frozen_string_literal: true

require 'rspec/core'
require 'varar/runner'

module Varar
  # RSpec adapter. One call defines an RSpec example group per spec matched by
  # varar.config.json, with one `it` per Markdown example (header-bound rows are
  # separate examples) and a drift gate. See ADR 0005.
  #
  #   # spec/var_spec.rb
  #   require "varar/rspec"
  #   Varar::RSpec.generate
  module RSpec
    VERSION = '0.6.1'

    module_function

    def generate(root: nil)
      root ||= File.dirname(caller_locations(1, 1).first.path)
      root = File.expand_path(root)
      cfg = Config.read_var_config(root)
      loaded = Runner.load_steps(cfg.steps, root)
      store = Runner.create_file_baseline_store(root)
      update = %w[1 true].include?(ENV.fetch('VARAR_UPDATE', nil))

      Runner.find_specs(cfg.docs_include, cfg.docs_exclude, root).each do |spec_path|
        define_group(spec_path, root, loaded, store, update)
      end
    end

    def define_group(spec_path, root, loaded, store, update)
      rel = Runner.rel_posix(spec_path, root)
      source = File.read(spec_path, encoding: 'UTF-8')
      plan = Runner.plan_spec(File.basename(spec_path), source, loaded.registry)
      pairs = Runner.examples_with_runs(plan, loaded.create_context, Runner::RecordingReporter.new)
      drifts = Core::Drifts.reconcile_drift(store, rel, source, plan.var_doc, plan, update: update)

      ::RSpec.describe(rel) do
        pairs.each do |example, run|
          # A var diff surfaces as a failure carrying the span-anchored render;
          # any other exception propagates. RSpec reports both as failures.
          it(example.name) do
            run.call
          rescue StandardError => e
            raise Runner.render_failure(e, source, rel) if RSpec.var_diff_error?(e)

            raise
          end
        end

        drifts.each do |drift|
          message = Core::Diagnostics.drift_detected(drift.name, drift.span).message
          it("var drift at line #{drift.line}") { raise message }
        end
      end
    end

    def var_diff_error?(error)
      error.is_a?(Core::CellMismatchError) ||
        error.is_a?(Core::ReturnShapeError) || error.is_a?(Core::UnexpectedPassError)
    end
  end
end
