# frozen_string_literal: true

Gem::Specification.new do |s|
  s.name = 'varar-config'
  s.version = '0.5.0'
  s.summary = 'Markdown-native BDD — varar.config.json reader'
  s.description = 'Strict, fail-loud reader for the shared varar.config.json format.'
  s.authors = ['Aslak Hellesøy']
  s.email = ['aslak@oselvar.com']
  s.homepage = 'https://varar.dev'
  s.license = 'MIT'
  s.required_ruby_version = '>= 3.2'
  s.files = Dir['lib/**/*.rb']
  s.require_paths = ['lib']
  s.metadata['rubygems_mfa_required'] = 'true'
end
