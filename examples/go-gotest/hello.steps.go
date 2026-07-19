package example

import "github.com/varar-dev/varar-go/varar"

func registerHelloVar(s *varar.Steps) {
	s.Stimulus("I greet {string}", func(state varar.Value, args []varar.Value) varar.HandlerReturn {
		m := smap(state)
		m["greeting"] = varar.StrValue("Hello, " + asStr(args[0]) + "!")
		return varar.Returns(varar.MapValue(m))
	})

	s.Sensor("the greeting should be {string}", func(state varar.Value, args []varar.Value) varar.HandlerReturn {
		if g, ok := smap(state)["greeting"]; ok {
			return varar.Returns(g)
		}
		return varar.NoReturn()
	})

	s.Stimulus("expression `{int}+{int}`", func(state varar.Value, args []varar.Value) varar.HandlerReturn {
		m := smap(state)
		m["result"] = varar.IntValue(asInt(args[0]) + asInt(args[1]))
		return varar.Returns(varar.MapValue(m))
	})

	s.Sensor("evaluate to `{int}`", func(state varar.Value, args []varar.Value) varar.HandlerReturn {
		if r, ok := smap(state)["result"]; ok {
			return varar.Returns(r)
		}
		return varar.NoReturn()
	})
}
