# frozen_string_literal: true

require 'spec_helper'
require 'varar/core'

module Varar
  module Core
    ::RSpec.describe CanonicalJson do
      subject(:stringify) { described_class.method(:canonical_stringify) }

      it 'sorts object keys recursively' do
        expect(stringify.call({ 'b' => 1, 'a' => { 'd' => 2, 'c' => 3 } }))
          .to eq(%({\n  "a": {\n    "c": 3,\n    "d": 2\n  },\n  "b": 1\n}\n))
      end

      it "renders empty containers as {} and [] (not Ruby's [\\n\\n])" do
        expect(stringify.call({ 'items' => [], 'meta' => {} }))
          .to eq(%({\n  "items": [],\n  "meta": {}\n}\n))
      end

      it 'indents arrays with two spaces per level' do
        expect(stringify.call([1, 2])).to eq("[\n  1,\n  2\n]\n")
      end

      it 'keeps non-ASCII raw and escapes control characters like JS' do
        expect(stringify.call({ 's' => "café 😀\n\t\"x\"" }))
          .to eq(%({\n  "s": "café 😀\\n\\t\\"x\\""\n}\n))
      end

      it 'appends a single trailing newline' do
        expect(stringify.call(true)).to eq("true\n")
      end
    end
  end
end
