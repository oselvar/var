# frozen_string_literal: true

Gem::Specification.new do |s|
  s.name = 'varar-rspec'
  s.version = '0.4.2'
  s.summary = 'Markdown-native BDD — run Markdown specs as RSpec examples'
  s.description = 'RSpec adapter: one selectable example per Markdown example, with a drift gate.'
  s.authors = ['Aslak Hellesøy']
  s.email = ['aslak@oselvar.com']
  s.homepage = 'https://varar.dev'
  s.license = 'MIT'
  s.required_ruby_version = '>= 3.2'
  s.files = Dir['lib/**/*.rb']
  s.require_paths = ['lib']

  s.add_dependency 'rspec-core', '~> 3.13'
  s.add_dependency 'varar-runner', '0.4.2'
  s.metadata['rubygems_mfa_required'] = 'true'
end
