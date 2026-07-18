# frozen_string_literal: true

module Varar
  module Core
    # FNV-1a (32-bit) change-detector over UTF-16 code units. Not a security
    # hash: tiny and byte-identical to the TS/Python/JVM ports so var.lock.json
    # fingerprints match everywhere. The "fnv1a:" prefix namespaces the algorithm.
    # Port of hash.ts.
    module Hash32
      FNV_OFFSET = 0x811c9dc5
      FNV_PRIME = 0x01000193
      MASK = 0xffffffff

      module_function

      def hash_source(source)
        h = FNV_OFFSET
        data = source.encode('UTF-16LE').bytes
        (0...data.length).step(2) do |i|
          unit = data[i] | (data[i + 1] << 8)
          h = ((h ^ unit) * FNV_PRIME) & MASK
        end
        format('fnv1a:%08x', h)
      end
    end
  end
end
