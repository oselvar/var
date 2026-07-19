package core

// Step handlers — Go's replacement for the reference's reflective arity-matched
// invocation. A handler is a closure over (state, args); args holds every
// expression capture plus the trailing table/doc string, in slot order. Go
// handlers are synchronous (a blocking func); there is no async variant — a
// handler that needs concurrency uses goroutines internally.

// HandlerError is an author-signalled failure (the analog of a thrown
// AssertionError / RuntimeException). Handlers return a plain `error`; the
// executor normalises it (and any recovered panic) into this.
type HandlerError struct {
	Message string
}

// NewHandlerError builds a HandlerError.
func NewHandlerError(message string) *HandlerError {
	return &HandlerError{Message: message}
}

func (e *HandlerError) Error() string { return e.Message }

// HandlerFunc is the closure a Handler wraps, in the idiomatic Go (value,
// error) shape:
//
//	(nil, nil)  — no assertion / no state change
//	(v,   nil)  — a value: for a stimulus the whole next state (any Go value,
//	              opaque to the core), for a sensor a *Value to compare
//	(nil, err)  — an author-signalled failure
//
// Panicking is equivalent to returning an error: the executor recovers it into
// the same failure channel, so assertion libraries that panic work unchanged.
type HandlerFunc func(state any, args []Value) (any, error)

// Handler is a registered step handler.
type Handler struct {
	f HandlerFunc
}

// NewHandler wraps a HandlerFunc.
func NewHandler(f HandlerFunc) Handler { return Handler{f: f} }

// NoopHandler is a no-op handler — used where a handler is never invoked.
func NoopHandler() Handler {
	return Handler{f: func(any, []Value) (any, error) { return nil, nil }}
}

// Ptr returns a pointer to v — the handler's way to say "this is my value".
func Ptr(v Value) *Value { return &v }

// call invokes the handler with state + args (captures then trailing attachment).
func (h Handler) call(state any, args []Value) (any, error) {
	if h.f == nil {
		return nil, nil
	}
	return h.f(state, args)
}
