# frozen_string_literal: true

require 'spec_helper'
require 'varar'
require 'varar/registry'

module Varar
  # Reproduces the shared conformance corpus' registry.json goldens
  # byte-for-byte (registration stage). Loads each bundle's *.steps.rb via the
  # facade, then projects the built registry. Mirrors var/tests/conformance.
  ::RSpec.describe 'registry conformance' do
    def self.corpus_dir
      dir = __dir__
      dir = File.dirname(dir) until File.directory?(File.join(dir, 'conformance', 'bundles')) || dir == '/'
      File.join(dir, 'conformance', 'bundles')
    end

    corpus = corpus_dir

    Dir.children(corpus).sort.each do |bundle|
      golden = File.join(corpus, bundle, 'golden', 'registry.json')
      steps_rb = Dir.glob(File.join(corpus, bundle, '*.steps.rb')).first
      next unless File.exist?(golden) && steps_rb

      it "#{bundle} — registry.json matches golden" do
        RegistryGlue.reset_builder
        load steps_rb
        registry = RegistryGlue.build_registry
        actual = Core::CanonicalJson.canonical_stringify(
          Core::Conformance.to_registry_artifact(registry, RegistryGlue.custom_parameter_types)
        )
        expect(actual).to eq(File.read(golden, encoding: 'UTF-8'))
      end
    end
  end
end
