package example

import (
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/varar-dev/varar/go/varar"
)

// dateLayout is the document's date notation — "June 1, 2026" — in Go's
// reference-time spelling.
const dateLayout = "January 2, 2006"

func registerLibrary(s *varar.Steps[Ctx]) {
	s.Param("date", `[A-Z][a-z]+ \d{1,2}, \d{4}`,
		func(g []string) time.Time {
			t, err := time.Parse(dateLayout, g[0])
			if err != nil {
				panic(err)
			}
			return t
		},
		func(d time.Time) (string, bool) { return d.Format(dateLayout), true })

	s.Param("money", `£\d+(?:\.\d+)?|\d+p`,
		func(g []string) Money {
			raw := g[0]
			if pence, ok := strings.CutSuffix(raw, "p"); ok {
				return GBP(mustFloat(pence) / 100)
			}
			return GBP(mustFloat(strings.TrimPrefix(raw, "£")))
		},
		func(m Money) (string, bool) {
			if m.Value < 1 {
				return fmt.Sprintf("%dp", int64(math.Round(m.Value*100))), true
			}
			return fmt.Sprintf("£%.2f", m.Value), true
		})

	s.Param("title", `\*[^*]+\*`,
		func(g []string) string { return strings.TrimSuffix(strings.TrimPrefix(g[0], "*"), "*") },
		func(t string) (string, bool) { return "*" + t + "*", true })

	s.Stimulus("borrowed {title}, due back on {date}", func(ctx Ctx, title string, due time.Time) (Ctx, error) {
		ctx.Loans = append(append([]Loan{}, ctx.Loans...), Loan{Title: title, Due: due})
		return ctx, nil
	})

	s.Stimulus("returns it on {date}", func(ctx Ctx, returned time.Time) (Ctx, error) {
		fee := GBP(0)
		for _, loan := range ctx.Loans {
			sum, err := AddMoney(fee, LateFee(loan, returned))
			if err != nil {
				return ctx, err
			}
			fee = sum
		}
		ctx.Fee = fee
		return ctx, nil
	})

	s.Sensor("owes a {money} late fee", func(ctx Ctx, expected Money) (Money, error) {
		return ctx.Fee, nil
	})

	s.Sensor("{money} for each day overdue", func(ctx Ctx, expected Money) (Money, error) {
		return FeePerDay, nil
	})

	s.Stimulus("asks to borrow {title} on {date}", func(ctx Ctx, title string, on time.Time) (Ctx, error) {
		ctx.Granted = MayBorrow(ctx.Loans, on)
		return ctx, nil
	})

	s.Sensor("the library refuses", func(ctx Ctx) error {
		if ctx.Granted {
			return errors.New("expected the library to refuse")
		}
		return nil
	})

	s.Sensor("the library agrees", func(ctx Ctx) error {
		if !ctx.Granted {
			return errors.New("expected the library to agree")
		}
		return nil
	})
}

func mustFloat(s string) float64 {
	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		panic("not a number: " + s)
	}
	return f
}
