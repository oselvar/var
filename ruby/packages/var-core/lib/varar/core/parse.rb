# frozen_string_literal: true

require 'varar/core/scanner'
require 'varar/core/structurer'

module Varar
  module Core
    # Parse +source+ into a VarDoc: scan blocks, then group into Examples.
    # Port of parse.ts.
    module Parse
      module_function

      def parse(path, source, plugins = [])
        Structurer.structure(path, source, Scanner.scan(source, plugins))
      end
    end
  end
end
