# frozen_string_literal: true

require 'spec_helper'
require 'varar/core'

module Varar
  module Core
    # Reproduces the shared conformance corpus' var-doc.json goldens
    # byte-for-byte (parse stage). Mirrors var/tests/conformance.test.ts.
    ::RSpec.describe 'var-doc conformance' do
      def self.corpus_dir
        dir = __dir__
        dir = File.dirname(dir) until File.directory?(File.join(dir, 'conformance', 'bundles')) || dir == '/'
        File.join(dir, 'conformance', 'bundles')
      end

      corpus = corpus_dir

      Dir.children(corpus).sort.each do |bundle|
        golden = File.join(corpus, bundle, 'golden', 'var-doc.json')
        next unless File.exist?(golden)

        it "#{bundle} — var-doc.json matches golden" do
          source = File.read(File.join(corpus, bundle, 'example.md'), encoding: 'UTF-8')
          doc = Parse.parse('example.md', source)
          actual = CanonicalJson.canonical_stringify(Conformance.to_var_doc_artifact(doc))
          expect(actual).to eq(File.read(golden, encoding: 'UTF-8'))
        end
      end
    end
  end
end
