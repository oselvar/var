# frozen_string_literal: true

require 'spec_helper'
require 'json'
require 'varar/runner'

module Varar
  ::RSpec.describe Runner do
    describe '.glob_to_regex / .match_spec?' do
      it 'matches * within a segment but not across /' do
        expect(described_class.glob_to_regex('*.md').match?('a.md')).to be(true)
        expect(described_class.glob_to_regex('*.md').match?('dir/a.md')).to be(false)
      end

      it 'matches **/ across nested segments (leading)' do
        rx = described_class.glob_to_regex('**/*.steps.rb')
        expect(rx.match?('a.steps.rb')).to be(true)
        expect(rx.match?('steps/a.steps.rb')).to be(true)
        expect(rx.match?('a/b/c.steps.rb')).to be(true)
      end

      it 'honours excludes' do
        root = Dir.pwd
        expect(described_class.match_spec?(File.join(root, 'a.md'), ['*.md'], [], root)).to be(true)
        expect(described_class.match_spec?(File.join(root, 'README.md'), ['*.md'], ['README.md'], root)).to be(false)
      end
    end

    describe 'dogfood: bundle outcomes match trace.json' do
      def self.corpus_dir
        dir = __dir__
        dir = File.dirname(dir) until File.directory?(File.join(dir, 'conformance', 'bundles')) || dir == '/'
        File.join(dir, 'conformance', 'bundles')
      end

      corpus = corpus_dir

      Dir.children(corpus).sort.each do |bundle|
        bundle_dir = File.join(corpus, bundle)
        trace_json = File.join(bundle_dir, 'golden', 'trace.json')
        steps_rb = Dir.glob(File.join(bundle_dir, '*.steps.rb')).first
        next unless File.exist?(trace_json) && steps_rb

        it "#{bundle} — runner outcomes agree with the trace goldens" do
          loaded = described_class.load_steps(['*.steps.rb'], bundle_dir)
          source = File.read(File.join(bundle_dir, 'example.md'), encoding: 'UTF-8')
          plan = described_class.plan_spec('example.md', source, loaded.registry)
          pairs = described_class.examples_with_runs(plan, loaded.create_context, Runner::RecordingReporter.new)

          actual = pairs.map do |example, run|
            outcome = 'pass'
            begin
              run.call
            rescue StandardError
              outcome = 'fail'
            end
            [example.name, outcome]
          end

          trace = JSON.parse(File.read(trace_json, encoding: 'UTF-8'))
          expected = trace['examples'].map { |e| [e['name'], e['outcome']] }
          expect(actual).to eq(expected)
        end
      end
    end
  end
end
