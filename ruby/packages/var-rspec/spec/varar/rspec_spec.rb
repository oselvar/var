# frozen_string_literal: true

require 'spec_helper'
require 'tmpdir'
require 'varar/rspec'

module Varar
  # The RSpec adapter is exercised end-to-end by examples/ruby-rspec (run via
  # the real `rspec` binary). Here we unit-test the failure classification and
  # that generate no-ops cleanly on a project with no specs.
  ::RSpec.describe RSpec do
    describe '.var_diff_error?' do
      it 'classifies var diff/shape errors as failures' do
        expect(described_class.var_diff_error?(Core::ReturnShapeError.new('x'))).to be(true)
        expect(described_class.var_diff_error?(Core::UnexpectedPassError.new)).to be(true)
        expect(described_class.var_diff_error?(Core::CellMismatchError.new([]))).to be(true)
      end

      it 'does not classify arbitrary errors as failures' do
        expect(described_class.var_diff_error?(RuntimeError.new('boom'))).to be(false)
      end
    end

    it 'generate no-ops when the project has no specs' do
      Dir.mktmpdir do |tmp|
        File.write(File.join(tmp, 'var.config.json'),
                   '{"docs":{"include":["*.md"]},"steps":["steps/*.steps.rb"]}')
        expect { described_class.generate(root: tmp) }.not_to raise_error
      end
    end
  end
end
