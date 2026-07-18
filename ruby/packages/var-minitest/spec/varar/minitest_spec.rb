# frozen_string_literal: true

require 'spec_helper'
require 'tmpdir'
require 'fileutils'
require 'varar/minitest'

module Varar
  ::RSpec.describe Minitest do
    def corpus_dir
      dir = __dir__
      dir = File.dirname(dir) until File.directory?(File.join(dir, 'conformance', 'bundles')) || dir == '/'
      File.join(dir, 'conformance', 'bundles')
    end

    # Build a throwaway project from a conformance bundle (its example.md +
    # *.steps.rb) with a matching var.config.json.
    def project_from_bundle(tmp, bundle, spec_name)
      src = File.join(corpus_dir, bundle)
      FileUtils.mkdir_p(File.join(tmp, 'steps'))
      FileUtils.cp(File.join(src, 'example.md'), File.join(tmp, spec_name))
      FileUtils.cp(Dir.glob(File.join(src, '*.steps.rb')).first, File.join(tmp, 'steps'))
      File.write(File.join(tmp, 'var.config.json'),
                 '{"docs":{"include":["*.md"]},"steps":["steps/*.steps.rb"]}')
    end

    it 'generates one Test subclass per spec with a passing method for a passing example' do
      Dir.mktmpdir do |tmp|
        project_from_bundle(tmp, '01-roman-numerals', 'pass.md')
        namespace = Module.new
        described_class.generate_tests(namespace, root: tmp)

        klass = namespace.constants.map { |c| namespace.const_get(c) }.first
        expect(klass.ancestors).to include(::Minitest::Test)
        methods = klass.instance_methods(false).grep(/^test_/)
        expect(methods).not_to be_empty
        methods.each do |m|
          expect { klass.new(m.to_s).public_send(m) }.not_to raise_error
        end
      end
    end

    it 'a doc-string mismatch surfaces as a Minitest::Assertion (a failure)' do
      Dir.mktmpdir do |tmp|
        project_from_bundle(tmp, '06-doc-string-mismatch', 'fail.md')
        namespace = Module.new
        described_class.generate_tests(namespace, root: tmp)

        klass = namespace.constants.map { |c| namespace.const_get(c) }.first
        method = klass.instance_methods(false).grep(/^test_/).first
        expect { klass.new(method.to_s).public_send(method) }.to raise_error(::Minitest::Assertion)
      end
    end
  end
end
