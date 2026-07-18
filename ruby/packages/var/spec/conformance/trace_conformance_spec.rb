# frozen_string_literal: true

require 'spec_helper'
require 'varar'
require 'varar/registry'

module Varar
  # Reproduces the shared conformance corpus' trace.json goldens byte-for-byte
  # (execution stage).
  ::RSpec.describe 'trace conformance' do
    def self.corpus_dir
      dir = __dir__
      dir = File.dirname(dir) until File.directory?(File.join(dir, 'conformance', 'bundles')) || dir == '/'
      File.join(dir, 'conformance', 'bundles')
    end

    corpus = corpus_dir

    Dir.children(corpus).sort.each do |bundle|
      golden = File.join(corpus, bundle, 'golden', 'trace.json')
      steps_rb = Dir.glob(File.join(corpus, bundle, '*.steps.rb')).first
      next unless File.exist?(golden) && steps_rb

      it "#{bundle} — trace.json matches golden" do
        RegistryGlue.reset_builder
        load steps_rb
        registry = RegistryGlue.build_registry
        create_context = RegistryGlue.context_factory
        source = File.read(File.join(corpus, bundle, 'example.md'), encoding: 'UTF-8')
        var_doc = Core::Parse.parse('example.md', source)
        artifacts = Core::Conformance.run_conformance(
          var_doc, registry, create_context, RegistryGlue.custom_parameter_types
        )
        actual = Core::CanonicalJson.canonical_stringify(artifacts[:trace])
        expect(actual).to eq(File.read(golden, encoding: 'UTF-8'))
      end
    end
  end
end
