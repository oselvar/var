package example

// Ctx is this project's step state — a plain struct, not a dynamic map. Every
// handler takes and returns it, so varar.Value never appears in a step file.
//
// State is full-replacement: a stimulus returns the whole next Ctx rather than
// mutating, and varcore keys it per step file, so each spec starts from a fresh
// zero value.
type Ctx struct {
	// hello-var
	Greeting string
	Result   int

	// library
	Loans   []Loan
	Fee     int
	Granted bool
}

// Loan is one borrowed title and its due date.
type Loan struct {
	Title string
	Due   Date
}
