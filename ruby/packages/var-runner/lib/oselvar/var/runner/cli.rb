# frozen_string_literal: true

require 'fileutils'

module Oselvar
  module Var
    module Runner
      # The `var` command-line entry point (exposed by the `exe/var`
      # executable). Today it offers a single sub-command, `var init`, which
      # scaffolds a new project: a `var.config.json`, one Markdown spec, its
      # step definitions, and a framework bridge that turns the specs into
      # RSpec examples or Minitest tests.
      #
      # The config, spec and steps mirror the TypeScript CLI (`@oselvar/var-cli`)
      # so a project started with `var init` looks the same in every language;
      # only the bridge is Ruby-specific, because RSpec/Minitest — unlike
      # pytest — need an explicit generator call to discover the specs.
      module CLI
        CONFIG = <<~JSON
          {
            "docs": { "include": ["var-examples/**/*.md"], "exclude": [] },
            "steps": ["var-examples/**/*.steps.rb"]
          }
        JSON

        EXAMPLE_MD = <<~MARKDOWN
          # Hello, BDD

          Given I greet "world"
          Then the greeting is "Hello, world!"
        MARKDOWN

        EXAMPLE_STEPS = <<~RUBY
          # frozen_string_literal: true

          require 'oselvar/var'

          steps(greeting: '') do
            stimulus('I greet {string}') { |_state, name| { greeting: "Hello, \#{name}!" } }
            sensor('the greeting is {string}') { |state, _expected| state[:greeting] }
          end
        RUBY

        RSPEC_BRIDGE = <<~RUBY
          # frozen_string_literal: true

          # Turn every Markdown spec matched by var.config.json into RSpec examples —
          # one `it` per Markdown example, discovered when this file loads.
          require 'oselvar/var/rspec'

          # var.config.json lives at the project root (the parent of spec/).
          Oselvar::Var::RSpec.generate(root: File.expand_path('..', __dir__))
        RUBY

        MINITEST_BRIDGE = <<~RUBY
          # frozen_string_literal: true

          require 'minitest/autorun'
          require 'oselvar/var/minitest'

          # Turn every Markdown spec matched by var.config.json into Minitest tests —
          # var.config.json lives at the project root (the parent of test/).
          Oselvar::Var::Minitest.generate_tests(Object, root: File.expand_path('..', __dir__))
        RUBY

        USAGE = <<~TEXT
          var — scaffold and run Markdown specs

          Usage:
            var init               scaffold a new project
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
            ['var.config.json', CONFIG],
            ['var-examples/01-hello.md', EXAMPLE_MD],
            ['var-examples/steps/01-hello.steps.rb', EXAMPLE_STEPS]
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
          return :rspec if gem_present?('oselvar-var-rspec')
          return :minitest if gem_present?('oselvar-var-minitest')

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
end
