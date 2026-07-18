# frozen_string_literal: true

require 'pathname'

module Varar
  module Runner
    module_function

    # Translate a glob with **, *, ? to an anchored regex (PEP 428 / pathlib
    # full_match semantics), matching the other ports' hand-rolled compiler
    # rather than Ruby's Dir glob. Port of _glob_to_regex.
    def glob_to_regex(pattern)
      result = +''
      i = 0
      n = pattern.length
      while i < n
        c = pattern[i]
        if c == '/' && pattern[i, 4] == '/**/'
          result << '/(?:.+/)?'
          i += 4
        elsif c == '/' && pattern[i, 3] == '/**' && i + 3 == n
          result << '(?:/.*)?'
          i += 3
        elsif c == '*' && pattern[i, 3] == '**/'
          result << '(?:.*/)?'
          i += 3
        elsif c == '*' && pattern[i, 2] == '**'
          result << '.*'
          i += 2
        elsif c == '*'
          result << '[^/]*'
          i += 1
        elsif c == '?'
          result << '[^/]'
          i += 1
        else
          result << Regexp.escape(c)
          i += 1
        end
      end
      /\A#{result}\z/
    end

    # Relative POSIX path of +path+ within +root+, without dereferencing
    # symlinks; yields a ../ prefix when +path+ is outside +root+.
    def rel_posix(path, root)
      Pathname.new(File.expand_path(path))
              .relative_path_from(Pathname.new(File.expand_path(root))).to_s
    end

    def matches_any?(rel, globs)
      globs.any? { |g| glob_to_regex(g).match?(rel) }
    end

    # True iff +path+ matches an include glob and no exclude glob.
    def match_spec?(path, include, exclude, root)
      rel = rel_posix(path, root)
      matches_any?(rel, include) && !matches_any?(rel, exclude)
    end

    # Existing files under +root+ matching any include glob, minus excludes; sorted.
    def find_specs(include, exclude, root)
      out = []
      include.each do |g|
        out.concat(Dir.glob(g, base: root).map { |rel| File.join(root, rel) })
      end
      out = out.select { |p| File.file?(p) }.uniq
      out.reject { |p| matches_any?(rel_posix(p, root), exclude) }.sort
    end
  end
end
