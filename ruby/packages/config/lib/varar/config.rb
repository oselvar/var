# frozen_string_literal: true

require 'json'

module Varar
  # Strict, fail-loud reader for the shared varar.config.json format. Missing
  # file → empty config; malformed JSON, wrong types, or unknown keys → an
  # error starting with the file path. See conformance/config/README.md.
  module Config
    VERSION = '0.6.1'

    # The parsed config. All fields default to empty.
    VarConfig = Data.define(:docs_include, :docs_exclude, :steps, :snippets) do
      def initialize(docs_include: [], docs_exclude: [], steps: [], snippets: {})
        super
      end
    end

    KNOWN_KEYS = %w[$schema docs steps snippets].freeze
    KNOWN_DOCS_KEYS = %w[include exclude].freeze

    module_function

    def read_var_config(root)
      path = File.join(root.to_s, 'varar.config.json')
      return VarConfig.new unless File.file?(path)

      data = begin
        JSON.parse(File.read(path, encoding: 'UTF-8'))
      rescue JSON::ParserError => e
        raise ArgumentError, "#{path}: invalid JSON: #{e.message}"
      end
      raise ArgumentError, "#{path}: top level must be an object" unless data.is_a?(::Hash)

      unknown = data.keys - KNOWN_KEYS
      raise ArgumentError, "#{path}: unknown key(s): #{unknown.sort.join(', ')}" unless unknown.empty?

      docs = data['docs'] || {}
      raise ArgumentError, "#{path}: 'docs' must be an object" unless docs.is_a?(::Hash)

      unknown_docs = docs.keys - KNOWN_DOCS_KEYS
      raise ArgumentError, "#{path}: unknown docs key(s): #{unknown_docs.sort.join(', ')}" unless unknown_docs.empty?

      snippets = data['snippets'] || {}
      unless snippets.is_a?(::Hash) && snippets.all? { |k, v| k.is_a?(String) && v.is_a?(String) }
        raise ArgumentError, "#{path}: 'snippets' must be an object of strings"
      end

      VarConfig.new(
        docs_include: string_array(docs['include'], 'docs.include', path),
        docs_exclude: string_array(docs['exclude'], 'docs.exclude', path),
        steps: string_array(data['steps'], 'steps', path),
        snippets: snippets
      )
    end

    def string_array(value, key, path)
      return [] if value.nil?
      unless value.is_a?(Array) && value.all?(String)
        raise ArgumentError, "#{path}: '#{key}' must be an array of strings"
      end

      value
    end
  end
end
