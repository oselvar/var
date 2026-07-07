# frozen_string_literal: true

require 'spec_helper'
require 'tmpdir'
require 'stringio'
require 'oselvar/var/runner/cli'

module Oselvar
  module Var
    module Runner
      ::RSpec.describe CLI do
        describe '.run_init' do
          it 'scaffolds the config, spec, steps and an RSpec bridge' do
            Dir.mktmpdir do |dir|
              out = StringIO.new
              code = described_class.run_init(dir, out, framework: :rspec)

              expect(code).to eq(0)
              expect(File.exist?(File.join(dir, 'var.config.json'))).to be(true)
              expect(File.exist?(File.join(dir, 'var-examples/01-hello.md'))).to be(true)
              steps = File.read(File.join(dir, 'var-examples/steps/01-hello.steps.rb'))
              expect(steps).to include('steps(greeting: \'\') do', 'stimulus(', 'sensor(')
              expect(File.read(File.join(dir, 'spec/var_spec.rb'))).to include('Oselvar::Var::RSpec.generate')
              expect(out.string).to include('created var.config.json')
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
              File.write(File.join(dir, 'var.config.json'), "{}\n")
              out = StringIO.new
              described_class.run_init(dir, out, framework: :rspec)

              expect(File.read(File.join(dir, 'var.config.json'))).to eq("{}\n")
              expect(out.string).to include('skipped var.config.json (already exists)')
            end
          end
        end
      end
    end
  end
end
