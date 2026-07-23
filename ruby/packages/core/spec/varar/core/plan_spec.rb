# frozen_string_literal: true

require 'spec_helper'
require 'varar/core'

module Varar
  module Core
    # Example-delimiter grouping (ADR 0012). Conformance goldens pin the wire
    # shape; these unit tests pin the grouping rule directly: consecutive
    # matching candidates merge into one shared-state example, and a delimiter
    # (heading, `---`, or a non-matching paragraph) splits them.
    ::RSpec.describe Plan do
      def noop = ->(*_args) {}

      def reg(*expressions)
        expressions.each_with_index.reduce(Registries.create_registry) do |r, (expression, i)|
          Registries.add_step(r, expression: expression, expression_source_file: 's.rb',
                                 expression_source_line: i + 1, handler: noop, kind: 'stimulus')
        end
      end

      def account_reg
        reg('I have {int} in my account', 'I withdraw {int}', 'I should have {int} left')
      end

      def plan_source(source, registry)
        described_class.plan(Parse.parse('m.md', source), registry)
      end

      def step_texts(example)
        example.steps.map(&:text)
      end

      it 'merges consecutive matching paragraphs (no delimiter) into one example' do
        source = "I have 100 in my account.\n\nI withdraw 40.\n\nI should have 60 left."
        result = plan_source(source, account_reg)
        expect(result.examples.length).to eq(1)
        expect(step_texts(result.examples[0])).to eq(['I have 100 in my account', 'I withdraw 40',
                                                      'I should have 60 left'])
        # The name is the first matching paragraph's text.
        expect(result.examples[0].name).to eq('I have 100 in my account')
      end

      it 'splits on a thematic break (---) between matching paragraphs' do
        source = "I have 100 in my account.\n\n---\n\nI withdraw 40."
        result = plan_source(source, account_reg)
        expect(result.examples.map { |e| step_texts(e) }).to eq([['I have 100 in my account'], ['I withdraw 40']])
      end

      it 'splits on a heading between matching paragraphs' do
        source = "I have 100 in my account.\n\n## Next\n\nI withdraw 40."
        result = plan_source(source, account_reg)
        expect(result.examples.length).to eq(2)
        expect(result.examples[1].scope_stack).to eq(['Next'])
      end

      it 'splits when a non-matching paragraph (prose) sits between matching paragraphs' do
        source = "I have 100 in my account.\n\nJust explaining what happens next.\n\nI withdraw 40."
        result = plan_source(source, account_reg)
        expect(result.examples.map { |e| step_texts(e) }).to eq([['I have 100 in my account'], ['I withdraw 40']])
      end

      it 'does not merge leading and trailing prose into an example' do
        source = "A preamble that matches nothing.\n\nI withdraw 40.\n\nA closing remark."
        result = plan_source(source, account_reg)
        expect(result.examples.length).to eq(1)
        expect(step_texts(result.examples[0])).to eq(['I withdraw 40'])
      end

      it 'merges consecutive list items into one example (a bulleted scenario)' do
        source = "# Bullets\n\n- Given I have 100 in my account\n- When I withdraw 40"
        result = plan_source(source, account_reg)
        expect(result.examples.length).to eq(1)
        expect(step_texts(result.examples[0])).to eq(['I have 100 in my account', 'I withdraw 40'])
      end

      it 'drops an ambiguous candidate: a diagnostic, not an example' do
        r = Registries.create_registry
        r = Registries.add_step(r, expression: 'I have {int} cukes', expression_source_file: 'a.rb',
                                   expression_source_line: 3, handler: noop, kind: 'stimulus')
        r = Registries.add_step(r, expression: 'I have {int} {word}', expression_source_file: 'a.rb',
                                   expression_source_line: 8, handler: noop, kind: 'stimulus')
        result = plan_source("# Ambig\n\nGiven I have 5 cukes", r)
        expect(result.diagnostics.length).to eq(1)
        expect(result.diagnostics[0].code).to eq('ambiguous-match')
        expect(result.examples).to be_empty
      end
    end
  end
end
