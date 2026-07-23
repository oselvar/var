# frozen_string_literal: true

require 'fileutils'

module Varar
  module Runner
    # The `var` command-line entry point (exposed by the `exe/var`
    # executable). Today it offers a single sub-command, `varar init`, which
    # scaffolds a new project: a `varar.config.json`, one Markdown oath, its
    # step definitions, and a framework bridge that turns the oaths into
    # RSpec examples or Minitest tests.
    #
    # The config, oath and steps mirror the TypeScript CLI (`@varar/cli`)
    # so a project started with `varar init` looks the same in every language;
    # only the bridge is Ruby-specific, because RSpec/Minitest — unlike
    # pytest — need an explicit generator call to discover the oaths.
    module CLI
      CONFIG = <<~JSON
        {
          "docs": { "include": ["varar-examples/**/*.md"], "exclude": [] },
          "steps": ["varar-examples/**/*.steps.rb"]
        }
      JSON

      EXAMPLE_MD = <<~MARKDOWN
        # Deep Thought

        You're really not going to like it.

        The answer to the great question of life, the universe and everything is 42.

        It was a tough assignment.
      MARKDOWN

      EXAMPLE_STEPS = <<~RUBY
        # frozen_string_literal: true

        require 'varar'

        steps do
          sensor('life, the universe and everything is {int}') { 42 }
        end
      RUBY

      RSPEC_BRIDGE = <<~RUBY
        # frozen_string_literal: true

        # Turn every Markdown oath matched by varar.config.json into RSpec examples —
        # one `it` per Markdown example, discovered when this file loads.
        require 'varar/rspec'

        # varar.config.json lives at the project root (the parent of spec/).
        Varar::RSpec.generate(root: File.expand_path('..', __dir__))
      RUBY

      MINITEST_BRIDGE = <<~RUBY
        # frozen_string_literal: true

        require 'minitest/autorun'
        require 'varar/minitest'

        # Turn every Markdown oath matched by varar.config.json into Minitest tests —
        # varar.config.json lives at the project root (the parent of test/).
        Varar::Minitest.generate_tests(Object, root: File.expand_path('..', __dir__))
      RUBY

      USAGE = <<~TEXT
        varar — scaffold and run Markdown oaths

        Usage:
          varar init               scaffold a new project
      TEXT

      def self.main(argv, cwd: Dir.pwd, out: $stdout)
        case argv.first
        when 'init'
          run_init(cwd, out)
        else
          out.print(USAGE)
          argv.empty? || %w[help -h --help].include?(argv.first) ? 0 : 1
        end
      end

      # Write the scaffold into +cwd+, skipping any file that already exists.
      # The framework bridge matches whichever adapter gem is installed
      # (RSpec by default).
      def self.run_init(cwd, out, framework: detect_framework)
        files = [
          ['varar.config.json', CONFIG],
          ['varar-examples/deep-thought.md', EXAMPLE_MD],
          ['varar-examples/steps/deep-thought.steps.rb', EXAMPLE_STEPS]
        ]
        files << if framework == :minitest
                   ['test/var_test.rb', MINITEST_BRIDGE]
                 else
                   ['spec/var_spec.rb', RSPEC_BRIDGE]
                 end

        files.each do |rel, content|
          target = File.join(cwd, rel)
          if File.exist?(target)
            out.puts "skipped #{rel} (already exists)"
            next
          end
          FileUtils.mkdir_p(File.dirname(target))
          File.write(target, content)
          out.puts "created #{rel}"
        end
        0
      end

      # RSpec when its adapter is installed, Minitest when only that one is,
      # RSpec as the fallback (matching the tutorial's default track).
      def self.detect_framework
        return :rspec if gem_present?('varar-rspec')
        return :minitest if gem_present?('varar-minitest')

        :rspec
      end

      def self.gem_present?(name)
        Gem::Specification.find_all_by_name(name).any?
      rescue StandardError
        false
      end
    end
  end
end
