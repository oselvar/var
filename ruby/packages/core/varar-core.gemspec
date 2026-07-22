# frozen_string_literal: true

Gem::Specification.new do |s|
  s.name = 'varar-core'
  s.version = '0.6.1'
  s.summary = 'Markdown-native BDD — pure functional core engine'
  s.description = 'The pure functional pipeline (parse, match, plan, execute, drift) behind Varar.'
  s.authors = ['Aslak Hellesøy']
  s.email = ['aslak@oselvar.com']
  s.homepage = 'https://varar.dev'
  s.license = 'MIT'
  s.required_ruby_version = '>= 3.2'
  s.files = Dir['lib/**/*.rb']
  s.require_paths = ['lib']

  # Exact version parity with every other port. NOTE the gem name: the doubled
  # "cucumber" prefix is the maintained gem; the plain `cucumber-expressions`
  # gem is abandoned at 8.3.0.
  s.add_dependency 'cucumber-cucumber-expressions', '20.0.0'
  s.metadata['rubygems_mfa_required'] = 'true'
end
