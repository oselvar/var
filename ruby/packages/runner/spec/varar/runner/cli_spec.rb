# frozen_string_literal: true

require 'spec_helper'
require 'tmpdir'
require 'stringio'
require 'varar/runner/cli'

module Varar
  module Runner
    ::RSpec.describe CLI do
      describe '.run_init' do
        it 'scaffolds the config, oath, steps and an RSpec bridge' do
          Dir.mktmpdir do |dir|
            out = StringIO.new
            code = described_class.run_init(dir, out, framework: :rspec)

            expect(code).to eq(0)
            expect(File.exist?(File.join(dir, 'varar.config.json'))).to be(true)
            expect(File.exist?(File.join(dir, 'varar-examples/deep-thought.md'))).to be(true)
            steps = File.read(File.join(dir, 'varar-examples/steps/deep-thought.steps.rb'))
            expect(steps).to include('steps do', 'sensor(')
            expect(File.read(File.join(dir, 'spec/var_spec.rb'))).to include('Varar::RSpec.generate')
            expect(out.string).to include('created varar.config.json')
          end
        end

        it 'writes a Minitest bridge when that framework is selected' do
          Dir.mktmpdir do |dir|
            described_class.run_init(dir, StringIO.new, framework: :minitest)
            expect(File.exist?(File.join(dir, 'test/var_test.rb'))).to be(true)
            expect(File.exist?(File.join(dir, 'spec/var_spec.rb'))).to be(false)
          end
        end

        it 'skips files that already exist' do
          Dir.mktmpdir do |dir|
            File.write(File.join(dir, 'varar.config.json'), "{}\n")
            out = StringIO.new
            described_class.run_init(dir, out, framework: :rspec)

            expect(File.read(File.join(dir, 'varar.config.json'))).to eq("{}\n")
            expect(out.string).to include('skipped varar.config.json (already exists)')
          end
        end
      end
    end
  end
end
