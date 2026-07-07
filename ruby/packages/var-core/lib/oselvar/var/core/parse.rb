# frozen_string_literal: true

require "oselvar/var/core/scanner"
require "oselvar/var/core/structurer"

module Oselvar
  module Var
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
end
