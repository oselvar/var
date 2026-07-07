# frozen_string_literal: true

module Oselvar
  module Var
    module Runner
      # The filesystem BaselineStore: the committed drift baseline lives at the
      # project root as var.lock.json. The core owns the format; this adapter
      # only moves raw text. Port of baseline_store.py.
      class FileBaselineStore
        def initialize(root)
          @path = File.join(root.to_s, "var.lock.json")
        end

        def read
          File.exist?(@path) ? File.read(@path, encoding: "UTF-8") : nil
        end

        def write(contents)
          File.write(@path, contents)
        end
      end

      module_function

      def create_file_baseline_store(root)
        FileBaselineStore.new(root)
      end
    end
  end
end
