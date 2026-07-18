# frozen_string_literal: true

# Functional-core purity gate (Ruby mirror of python/scripts/lint_no_reexports.py
# and scripts/lint-no-reexports.mjs): var-core must never require the facade,
# config, or runner. Fails loudly if it does.
require 'pathname'

ROOT = Pathname.new(__dir__).join('..').expand_path
CORE_LIB = ROOT.join('packages/var-core/lib')

FORBIDDEN = [
  /require\s+["']varar["']/, # the facade
  %r{require\s+["']varar/config["']},
  %r{require\s+["']varar/runner["']},
  %r{require\s+["']varar/rspec["']},
  %r{require\s+["']varar/minitest["']}
].freeze

violations = []
CORE_LIB.glob('**/*.rb').each do |file|
  file.each_line.with_index(1) do |line, n|
    FORBIDDEN.each do |pattern|
      violations << "#{file.relative_path_from(ROOT)}:#{n}: #{line.strip}" if line.match?(pattern)
    end
  end
end

unless violations.empty?
  warn 'var-core must not depend on the facade/config/runner:'
  violations.each { |v| warn "  #{v}" }
  exit 1
end

puts 'purity gate: var-core has no facade/config/runner requires ✓'
