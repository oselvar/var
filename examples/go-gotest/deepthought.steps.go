package example

import "github.com/varar-dev/varar-go/varar"

func registerDeepThought(s *varar.Steps) {
	s.Sensor("life, the universe and everything is {int}", func(state varar.Value, args []varar.Value) varar.HandlerReturn {
		return varar.Returns(varar.IntValue(42))
	})
}
