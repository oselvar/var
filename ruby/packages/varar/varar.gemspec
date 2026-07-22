# frozen_string_literal: true

Gem::Specification.new do |s|
  s.name = 'varar'
  s.version = '0.6.1'
  s.summary = 'Markdown-native BDD — author API (define_state)'
  s.description = 'The Varar author facade: define_state and the step-registration accumulator.'
  s.authors = ['Aslak Hellesøy']
  s.email = ['aslak@oselvar.com']
  s.homepage = 'https://varar.dev'
  s.license = 'MIT'
  s.required_ruby_version = '>= 3.2'
  s.files = Dir['lib/**/*.rb']
  s.require_paths = ['lib']

  s.add_dependency 'cucumber-cucumber-expressions', '20.0.0'
  s.add_dependency 'varar-core', '0.6.1'
  s.metadata['rubygems_mfa_required'] = 'true'
end
