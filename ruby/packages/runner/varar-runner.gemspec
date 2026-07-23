# frozen_string_literal: true

Gem::Specification.new do |s|
  s.name = 'varar-runner'
  s.version = '0.7.0'
  s.summary = 'Markdown-native BDD — imperative shell (discovery, loading, drift)'
  s.description = 'Spec/step discovery, step loading, planning, failure rendering, and the drift baseline store.'
  s.authors = ['Aslak Hellesøy']
  s.email = ['aslak@oselvar.com']
  s.homepage = 'https://varar.dev'
  s.license = 'MIT'
  s.required_ruby_version = '>= 3.2'
  s.files = Dir['lib/**/*.rb'] + Dir['exe/*']
  s.bindir = 'exe'
  s.executables = ['varar']
  s.require_paths = ['lib']

  s.add_dependency 'varar', '0.7.0'
  s.add_dependency 'varar-config', '0.7.0'
  s.metadata['rubygems_mfa_required'] = 'true'
end
