# Vár + Ruby + Minitest

A standalone sample project that runs Markdown specs as Minitest tests with
[Vár](https://var.oselvar.com).

The `*.md` files at the project root are the specs — plain Markdown prose that
runs as tests. `steps/*.steps.rb` bind the sentences to Ruby inside a
`steps(...) do … end` block with `stimulus`/`sensor` (and `param` for custom
types). `var.config.json` says which files are specs (`docs`) and where the
step definitions live (`steps`).

## Run

```sh
bundle install
bundle exec rake test
```

`test/var_test.rb` calls `Oselvar::Var::Minitest.generate_tests`, which injects
one `Minitest::Test` subclass per spec with one test method per Markdown example
(header-bound table rows are separate methods). A paragraph that used to match a
step and no longer does fails as **drift**; re-run with `VAR_UPDATE=1` to accept
it. The committed `var.lock.json` is that drift baseline.
