package example

import "github.com/varar-dev/varar-go/varar"

func registerDeepThought(s *varar.Steps[Ctx]) {
	s.Sensor("life, the universe and everything is {int}", func(ctx Ctx, answer int) (int, error) {
		return 42, nil
	})
}
