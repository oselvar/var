package varcore

// Parse is the top-level parse entry point: scan then structure — port of
// parse.ts / parse.rs.
func Parse(path, source string) VarDoc {
	return structure(path, source, scan(source))
}
