# frozen_string_literal: true

require 'spec_helper'
require 'varar/core'

module Varar
  module Core
    # A tiny in-memory BaselineStore for the reconcile tests.
    class MemoryStore
      attr_accessor :contents

      def initialize(initial = nil)
        @contents = initial
      end

      def read = @contents
      def write(contents) = (@contents = contents)
    end

    # Translated from drift.test.ts / test_drift.py. Drift has no conformance
    # golden (bundles carry no baseline), so it is proven by these unit tests.
    ::RSpec.describe Drifts do
      def noop = ->(*_args) {}

      def reg(with_step: true)
        r = Registries.create_registry
        if with_step
          r = Registries.add_step(r, expression: 'I withdraw {int}', expression_source_file: 'steps.rb',
                                     expression_source_line: 1, handler: noop, kind: 'stimulus')
        end
        r
      end

      def roman_reg(with_step: true)
        r = Registries.create_registry
        if with_step
          r = Registries.add_step(r, expression: 'a decimal and a roman number', expression_source_file: 'steps.rb',
                                     expression_source_line: 1, handler: noop, kind: 'sensor')
        end
        r
      end

      def plan_for(source, registry)
        var_doc = Parse.parse('w.md', source)
        [var_doc, Plan.plan(var_doc, registry)]
      end

      def bare(drifts) = drifts.map { |d| [d.name, d.line] }

      it 'records one entry per example-producing paragraph' do
        var_doc, plan = plan_for('I withdraw 40.', reg)
        expect(described_class.live_examples(var_doc,
                                             plan)).to eq([BaselineExample.new(name: 'I withdraw 40', line: 1)])
      end

      it 'does not record a never-matched paragraph' do
        var_doc, plan = plan_for('Just some prose.', reg)
        expect(described_class.live_examples(var_doc, plan)).to eq([])
      end

      it 'derive_spec_baseline carries the source fingerprint' do
        source = 'I withdraw 40.'
        var_doc, plan = plan_for(source, reg)
        baseline = described_class.derive_spec_baseline(source, var_doc, plan)
        expect(baseline.source_hash).to eq(Hash32.hash_source(source))
        expect(baseline.examples).to eq([BaselineExample.new(name: 'I withdraw 40', line: 1)])
      end

      it 'no baseline means no drift' do
        var_doc, plan = plan_for('I withdraw 40.', reg)
        expect(described_class.detect_drift(nil, var_doc, plan)).to eq([])
      end

      it 'an unchanged spec and steps have no drift' do
        source = 'I withdraw 40.'
        var_doc, plan = plan_for(source, reg)
        baseline = described_class.derive_spec_baseline(source, var_doc, plan)
        expect(described_class.detect_drift(baseline, var_doc, plan)).to eq([])
      end

      it 'a renamed step drifts (matched by name)' do
        source = 'I withdraw 40.'
        var_doc, plan_with = plan_for(source, reg)
        baseline = described_class.derive_spec_baseline(source, var_doc, plan_with)
        _doc, plan_without = plan_for(source, reg(with_step: false))
        expect(bare(described_class.detect_drift(baseline, var_doc, plan_without))).to eq([['I withdraw 40', 1]])
      end

      it 'an in-place typo drifts (matched by line)' do
        before_doc, before_plan = plan_for('I withdraw 40.', reg)
        baseline = described_class.derive_spec_baseline('I withdraw 40.', before_doc, before_plan)
        after_doc, after_plan = plan_for('I withdrraw 40.', reg)
        expect(bare(described_class.detect_drift(baseline, after_doc, after_plan))).to eq([['I withdraw 40', 1]])
      end

      it 'a deleted paragraph is not drift' do
        before_doc, before_plan = plan_for('I withdraw 40.', reg)
        baseline = described_class.derive_spec_baseline('I withdraw 40.', before_doc, before_plan)
        after_doc, after_plan = plan_for('', reg)
        expect(described_class.detect_drift(baseline, after_doc, after_plan)).to eq([])
      end

      it 'moving and rewording a still-matching example does not drift' do
        before = "I withdraw 40.\n\nI withdraw 10."
        before_doc, before_plan = plan_for(before, reg)
        baseline = described_class.derive_spec_baseline(before, before_doc, before_plan)
        after_doc, after_plan = plan_for("I withdraw 11.\n\nI withdraw 40.", reg)
        expect(described_class.detect_drift(baseline, after_doc, after_plan)).to eq([])
      end

      it 'move + reword + prose on the old line does not false-positive' do
        before_doc, before_plan = plan_for('I withdraw 40.', reg)
        baseline = described_class.derive_spec_baseline('I withdraw 40.', before_doc, before_plan)
        after_doc, after_plan = plan_for("Just some notes.\n\nI withdraw 41.", reg)
        expect(described_class.detect_drift(baseline, after_doc, after_plan)).to eq([])
      end

      it 'a paragraph rewritten past recognition is remove+add, not drift' do
        before_doc, before_plan = plan_for('I withdraw 40.', reg)
        baseline = described_class.derive_spec_baseline('I withdraw 40.', before_doc, before_plan)
        after_doc, after_plan = plan_for('The branch closed years ago.', reg)
        expect(described_class.detect_drift(baseline, after_doc, after_plan)).to eq([])
      end

      roman = "Each row gives a decimal and a roman number:\n\n" \
              "| decimal | roman |\n| ------: | :---- |\n| 3 | III |\n| 9 | IX |\n"

      it 'header-bound table records its binding paragraph once' do
        var_doc, plan = plan_for(roman, roman_reg)
        expect(described_class.live_examples(var_doc, plan))
          .to eq([BaselineExample.new(name: 'Each row gives a decimal and a roman number:', line: 1)])
      end

      it 'a header-bound binding paragraph that stops matching drifts' do
        var_doc, plan_with = plan_for(roman, roman_reg)
        baseline = described_class.derive_spec_baseline(roman, var_doc, plan_with)
        _doc, plan_without = plan_for(roman, roman_reg(with_step: false))
        expect(bare(described_class.detect_drift(baseline, var_doc, plan_without)))
          .to eq([['Each row gives a decimal and a roman number:', 1]])
      end

      # ---- Merged examples keep per-paragraph drift granularity (ADR 0012) ----

      def deposit_withdraw_reg(with_deposit: true)
        r = Registries.create_registry
        if with_deposit
          r = Registries.add_step(r, expression: 'I deposit {int}', expression_source_file: 'steps.rb',
                                     expression_source_line: 1, handler: noop, kind: 'stimulus')
        end
        Registries.add_step(r, expression: 'I withdraw {int}', expression_source_file: 'steps.rb',
                               expression_source_line: 2, handler: noop, kind: 'stimulus')
      end

      it 'two paragraphs that merge into one example are each recorded as a live baseline entry' do
        source = "I deposit 100.\n\nI withdraw 40."
        var_doc, plan = plan_for(source, deposit_withdraw_reg)
        # One planned example (the two paragraphs merged), but two live entries.
        expect(plan.examples.length).to eq(1)
        expect(described_class.live_examples(var_doc, plan)).to eq([
                                                                     BaselineExample.new(name: 'I deposit 100',
                                                                                         line: 1),
                                                                     BaselineExample.new(name: 'I withdraw 40', line: 3)
                                                                   ])
      end

      it 'deleting one step def of a merged example drifts only the now-prose paragraph' do
        source = "I deposit 100.\n\nI withdraw 40."
        var_doc, plan_with = plan_for(source, deposit_withdraw_reg(with_deposit: true))
        baseline = described_class.derive_spec_baseline(source, var_doc, plan_with)
        # The deposit step is gone: its paragraph becomes prose, splitting the
        # example. The withdraw paragraph stays live; the deposit one drifts.
        _doc, plan_without = plan_for(source, deposit_withdraw_reg(with_deposit: false))
        expect(bare(described_class.detect_drift(baseline, var_doc, plan_without))).to eq([['I deposit 100', 1]])
      end

      it 'drift diagnostics are error severity' do
        source = 'I withdraw 40.'
        var_doc, plan_with = plan_for(source, reg)
        baseline = described_class.derive_spec_baseline(source, var_doc, plan_with)
        _doc, plan_without = plan_for(source, reg(with_step: false))
        diags = described_class.drift_diagnostics(described_class.detect_drift(baseline, var_doc, plan_without))
        expect(diags.length).to eq(1)
        expect(diags[0].severity).to eq('error')
        expect(diags[0].code).to eq('drift')
        expect(diags[0].message).to include('I withdraw 40')
      end

      it 'reconcile records on first run, then reports and preserves on drift' do
        source = 'I withdraw 40.'
        var_doc, plan_with = plan_for(source, reg)
        store = MemoryStore.new
        expect(described_class.reconcile_drift(store, 'w.md', source, var_doc, plan_with)).to eq([])
        before = store.contents
        _doc, plan_without = plan_for(source, reg(with_step: false))
        drift = described_class.reconcile_drift(store, 'w.md', source, var_doc, plan_without)
        expect(bare(drift)).to eq([['I withdraw 40', 1]])
        expect(store.contents).to eq(before)
      end

      it 'reconcile update mode accepts drift' do
        source = 'I withdraw 40.'
        var_doc, plan_with = plan_for(source, reg)
        store = MemoryStore.new
        described_class.reconcile_drift(store, 'w.md', source, var_doc, plan_with)
        _doc, plan_without = plan_for(source, reg(with_step: false))
        drift = described_class.reconcile_drift(store, 'w.md', source, var_doc, plan_without, update: true)
        expect(drift).to eq([])
        lock = described_class.parse_var_lock(store.contents)
        expect(lock.specs['w.md'].examples).to eq([])
      end

      expected_lock = <<~JSON
        {
          "version": 1,
          "specs": {
            "library.md": {
              "sourceHash": "fnv1a:1a2b3c4d",
              "examples": [
                {
                  "name": "I check out",
                  "line": 7
                }
              ]
            }
          }
        }
      JSON

      it 'stringify matches the TypeScript serializer byte-for-byte' do
        lock = VarLock.new(
          version: 1,
          specs: { 'library.md' => SpecBaseline.new(source_hash: 'fnv1a:1a2b3c4d',
                                                    examples: [BaselineExample.new(name: 'I check out', line: 7)]) }
        )
        expect(described_class.stringify_var_lock(lock)).to eq(expected_lock)
      end

      it 'parse round-trips a valid lock' do
        lock = VarLock.new(
          version: 1,
          specs: { 'library.md' => SpecBaseline.new(source_hash: 'fnv1a:1a2b3c4d',
                                                    examples: [BaselineExample.new(name: 'I check out', line: 7)]) }
        )
        expect(described_class.parse_var_lock(described_class.stringify_var_lock(lock))).to eq(lock)
      end

      it 'stringify sorts spec paths' do
        lock = VarLock.new(
          version: 1,
          specs: {
            'zebra.md' => SpecBaseline.new(source_hash: 'fnv1a:00000001', examples: []),
            'alpha.md' => SpecBaseline.new(source_hash: 'fnv1a:00000002', examples: [])
          }
        )
        text = described_class.stringify_var_lock(lock)
        expect(text.index('alpha.md')).to be < text.index('zebra.md')
        expect(text).to end_with("}\n")
      end

      it 'parse rejects malformed input' do
        expect(described_class.parse_var_lock('not json')).to be_nil
        expect(described_class.parse_var_lock('{}')).to be_nil
        expect(described_class.parse_var_lock('{"version":2,"specs":{}}')).to be_nil
        expect(described_class.parse_var_lock('{"version":1,"specs":{"a.md":{"examples":[]}}}')).to be_nil
      end
    end
  end
end
