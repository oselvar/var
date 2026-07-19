package example

import (
	"fmt"
	"strconv"
	"strings"
)

// FeePerDay is the overdue fee in pennies per day.
const FeePerDay int64 = 50

var months = []string{
	"January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December",
}

// Date is a calendar date.
type Date struct {
	Year  int64
	Month int64
	Day   int64
}

// Serial is the days-since-epoch serial (Howard Hinnant's algorithm).
func (d Date) Serial() int64 {
	y, m, day := d.Year, d.Month, d.Day
	if m <= 2 {
		y--
	}
	var era int64
	if y >= 0 {
		era = y / 400
	} else {
		era = (y - 399) / 400
	}
	yoe := y - era*400
	var mp int64
	if m > 2 {
		mp = m - 3
	} else {
		mp = m + 9
	}
	doy := (153*mp+2)/5 + day - 1
	doe := yoe*365 + yoe/4 - yoe/100 + doy
	return era*146097 + doe - 719468
}

// ParseDate parses "Month D, YYYY".
func ParseDate(raw string) Date {
	monthDay, year, ok := strings.Cut(raw, ", ")
	if !ok {
		panic("not a date: " + raw)
	}
	month, day, ok := strings.Cut(monthDay, " ")
	if !ok {
		panic("not a date: " + raw)
	}
	mi := -1
	for i, m := range months {
		if m == month {
			mi = i
			break
		}
	}
	if mi < 0 {
		panic("not a month: " + month)
	}
	return Date{Year: mustInt(year), Month: int64(mi) + 1, Day: mustInt(day)}
}

// FormatDate renders a Date as "Month D, YYYY".
func FormatDate(d Date) string {
	return fmt.Sprintf("%s %d, %d", months[d.Month-1], d.Day, d.Year)
}

// ParseMoney parses "£X.YZ" or "Np" into pennies.
func ParseMoney(raw string) int64 {
	if pence, ok := strings.CutSuffix(raw, "p"); ok {
		return mustInt(pence)
	}
	if pounds, ok := strings.CutPrefix(raw, "£"); ok {
		f, err := strconv.ParseFloat(pounds, 64)
		if err != nil {
			panic("not money: " + raw)
		}
		return int64(f*100 + 0.5)
	}
	panic("not money: " + raw)
}

// FormatMoney renders pennies as "£X.YZ" or "Np".
func FormatMoney(pennies int64) string {
	if pennies < 100 {
		return fmt.Sprintf("%dp", pennies)
	}
	return fmt.Sprintf("£%.2f", float64(pennies)/100.0)
}

// LateFee is the fee for returning on returnedOn against a due date.
func LateFee(due, returnedOn Date) int64 {
	daysLate := returnedOn.Serial() - due.Serial()
	if daysLate < 0 {
		daysLate = 0
	}
	return daysLate * FeePerDay
}

// MayBorrow reports whether a borrow on `on` is allowed given existing dues.
func MayBorrow(dues []Date, on Date) bool {
	for _, due := range dues {
		if due.Serial() < on.Serial() {
			return false
		}
	}
	return true
}

func mustInt(s string) int64 {
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		panic("not an integer: " + s)
	}
	return n
}
