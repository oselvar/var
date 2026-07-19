package example

import "github.com/varar-dev/varar-go/varar"

func registerHelloVar(s *varar.Steps[Ctx]) {
	s.Stimulus("I greet {string}", func(ctx Ctx, name string) (Ctx, error) {
		ctx.Greeting = "Hello, " + name + "!"
		return ctx, nil
	})

	s.Sensor("the greeting should be {string}", func(ctx Ctx, expected string) (string, error) {
		return ctx.Greeting, nil
	})

	s.Stimulus("expression `{int}+{int}`", func(ctx Ctx, a, b int) (Ctx, error) {
		ctx.Result = a + b
		return ctx, nil
	})

	s.Sensor("evaluate to `{int}`", func(ctx Ctx, expected int) (int, error) {
		return ctx.Result, nil
	})
}
