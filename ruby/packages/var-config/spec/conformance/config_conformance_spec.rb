# frozen_string_literal: true

require 'spec_helper'
require 'varar/config'
require 'varar/core' # for CanonicalJson (test-only)

module Varar
  # Reproduces the shared config corpus byte-for-byte: each case parses to its
  # golden.json, or (with an expect-error.txt marker) must fail to load. See
  # conformance/config/README.md.
  ::RSpec.describe 'config conformance' do
    def self.cases_dir
      dir = __dir__
      dir = File.dirname(dir) until File.directory?(File.join(dir, 'conformance', 'config', 'cases')) || dir == '/'
      File.join(dir, 'conformance', 'config', 'cases')
    end

    def self.artifact(cfg)
      {
        'docs' => { 'include' => cfg.docs_include, 'exclude' => cfg.docs_exclude },
        'steps' => cfg.steps,
        'snippets' => cfg.snippets,
        'scannerPlugins' => cfg.scanner_plugins
      }
    end

    cases = cases_dir

    Dir.children(cases).sort.each do |name|
      case_dir = File.join(cases, name)
      next unless File.directory?(case_dir)

      if File.exist?(File.join(case_dir, 'expect-error.txt'))
        it "#{name} — loading fails" do
          expect { Config.read_var_config(case_dir) }.to raise_error(StandardError)
        end
      else
        it "#{name} — matches golden" do
          actual = Core::CanonicalJson.canonical_stringify(self.class.artifact(Config.read_var_config(case_dir)))
          expect(actual).to eq(File.read(File.join(case_dir, 'golden.json'), encoding: 'UTF-8'))
        end
      end
    end
  end
end
