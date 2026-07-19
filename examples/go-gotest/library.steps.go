package example

import (
	"strings"

	"github.com/varar-dev/varar-go/varar"
)

func dateValue(d Date) varar.Value {
	return varar.MapValue(map[string]varar.Value{
		"year":  varar.IntValue(d.Year),
		"month": varar.IntValue(d.Month),
		"day":   varar.IntValue(d.Day),
	})
}

func valueDate(v varar.Value) Date {
	m := smap(v)
	return Date{Year: asInt(m["year"]), Month: asInt(m["month"]), Day: asInt(m["day"])}
}

func loanDue(loan varar.Value) Date {
	return valueDate(smap(loan)["due"])
}

func loansOf(state varar.Value) []varar.Value {
	if l, ok := smap(state)["loans"]; ok {
		if list, ok := l.AsList(); ok {
			return list
		}
	}
	return nil
}

func registerLibrary(s *varar.Steps) {
	s.Param("date", `[A-Z][a-z]+ \d{1,2}, \d{4}`,
		func(g []string) varar.Value { return dateValue(ParseDate(g[0])) },
		func(v varar.Value) (string, bool) { return FormatDate(valueDate(v)), true })

	s.Param("money", `£\d+(?:\.\d+)?|\d+p`,
		func(g []string) varar.Value { return varar.IntValue(ParseMoney(g[0])) },
		func(v varar.Value) (string, bool) {
			if p, ok := v.AsInt(); ok {
				return FormatMoney(p), true
			}
			return "", false
		})

	s.Param("title", `\*[^*]+\*`,
		func(g []string) varar.Value {
			inner := strings.TrimSuffix(strings.TrimPrefix(g[0], "*"), "*")
			return varar.StrValue(inner)
		},
		func(v varar.Value) (string, bool) {
			if t, ok := v.AsString(); ok {
				return "*" + t + "*", true
			}
			return "", false
		})

	s.Stimulus("borrowed {title}, due back on {date}", func(state varar.Value, args []varar.Value) varar.HandlerReturn {
		m := smap(state)
		loans := append(loansOf(state), varar.MapValue(map[string]varar.Value{"title": args[0], "due": args[1]}))
		m["loans"] = varar.ListOf(loans)
		return varar.Returns(varar.MapValue(m))
	})

	s.Stimulus("returns it on {date}", func(state varar.Value, args []varar.Value) varar.HandlerReturn {
		returned := valueDate(args[0])
		var fee int64
		for _, loan := range loansOf(state) {
			fee += LateFee(loanDue(loan), returned)
		}
		m := smap(state)
		m["fee"] = varar.IntValue(fee)
		return varar.Returns(varar.MapValue(m))
	})

	s.Sensor("owes a {money} late fee", func(state varar.Value, args []varar.Value) varar.HandlerReturn {
		if f, ok := smap(state)["fee"]; ok {
			return varar.Returns(f)
		}
		return varar.NoReturn()
	})

	s.Sensor("{money} for each day overdue", func(state varar.Value, args []varar.Value) varar.HandlerReturn {
		return varar.Returns(varar.IntValue(FeePerDay))
	})

	s.Stimulus("asks to borrow {title} on {date}", func(state varar.Value, args []varar.Value) varar.HandlerReturn {
		on := valueDate(args[1])
		var dues []Date
		for _, loan := range loansOf(state) {
			dues = append(dues, loanDue(loan))
		}
		m := smap(state)
		m["granted"] = varar.BoolValue(MayBorrow(dues, on))
		return varar.Returns(varar.MapValue(m))
	})

	s.Sensor("the library refuses", func(state varar.Value, args []varar.Value) varar.HandlerReturn {
		if g, ok := smap(state)["granted"]; ok {
			if b, _ := g.AsBool(); b {
				panic("expected the library to refuse")
			}
		}
		return varar.NoReturn()
	})

	s.Sensor("the library agrees", func(state varar.Value, args []varar.Value) varar.HandlerReturn {
		g, ok := smap(state)["granted"]
		granted := false
		if ok {
			granted, _ = g.AsBool()
		}
		if !granted {
			panic("expected the library to agree")
		}
		return varar.NoReturn()
	})
}
