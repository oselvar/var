module github.com/varar-dev/varar-examples/go-gotest

go 1.26

require github.com/varar-dev/varar/go v0.0.0

require (
	github.com/cucumber/cucumber-expressions-go v6.2.0+incompatible // indirect
	github.com/davecgh/go-spew v1.1.1 // indirect
	github.com/pmezard/go-difflib v1.0.0 // indirect
	gopkg.in/yaml.v3 v3.0.1 // indirect
)

// This sample depends on the in-repo Go module by path. The release sync
// (release/targets/70-varar-examples.sh) rewrites this to a published version.
replace github.com/varar-dev/varar/go => ../../go
