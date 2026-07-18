# frozen_string_literal: true

require 'spec_helper'
require 'varar/core'

module Varar
  module Core
    # Translated from hash.test.ts / test_hash.py.
    ::RSpec.describe Hash32 do
      def hash_source(source) = described_class.hash_source(source)

      it 'is deterministic' do
        expect(hash_source('abc')).to eq(hash_source('abc'))
      end

      it 'changes for a one-character difference' do
        expect(hash_source('abc')).not_to eq(hash_source('abd'))
      end

      it 'is namespaced with the algorithm prefix' do
        expect(hash_source('abc')).to start_with('fnv1a:')
      end

      it 'matches the TypeScript vectors' do
        expect(hash_source('hello')).to eq('fnv1a:4f9f2cab')
        expect(hash_source('abc')).to eq('fnv1a:1a47e90b')
        expect(hash_source("# Title\n")).to eq('fnv1a:4eace75e')
      end
    end
  end
end
