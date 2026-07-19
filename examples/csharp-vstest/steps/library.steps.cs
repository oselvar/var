using Varar;
using Varar.Core;
using static Varar.Example.StepHelpers;
using LibDate = Varar.Example.Library.Date;

namespace Varar.Example;

public static class LibrarySteps
{
    private static Value DateValue(LibDate d) =>
        VMap(("year", Value.Of(d.Year)), ("month", Value.Of(d.Month)), ("day", Value.Of(d.Day)));

    private static LibDate ValueDate(Value v)
    {
        var m = SMap(v);
        return new LibDate(AsInt(m["year"]), AsInt(m["month"]), AsInt(m["day"]));
    }

    private static LibDate LoanDue(Value loan) => ValueDate(SMap(loan)["due"]);

    private static IReadOnlyList<Value> LoansOf(Value state) =>
        SMap(state).TryGetValue("loans", out var l) && l is VList vl ? vl.Items : (IReadOnlyList<Value>)[];

    public static Registry Register(Registry r)
    {
        var s = Steps.From(r);
        s.DefineState(() => VMap(("loans", Value.List([])), ("fee", Value.Of(0)), ("granted", Value.Of(false))));

        s.Param(
            "date",
            @"[A-Z][a-z]+ \d{1,2}, \d{4}",
            g => DateValue(Library.ParseDate(g[0]!)),
            v => Library.FormatDate(ValueDate(v)));

        s.Param(
            "money",
            @"£\d+(?:\.\d+)?|\d+p",
            g => Value.Of(Library.ParseMoney(g[0]!)),
            v => v is VInt pennies ? Library.FormatMoney(pennies.Int) : v.ToString()!);

        s.Param(
            "title",
            @"\*[^*]+\*",
            g =>
            {
                var raw = g[0]!;
                var inner = raw.Length >= 2 && raw[0] == '*' && raw[^1] == '*' ? raw[1..^1] : raw;
                return Value.Of(inner);
            },
            v => v is VString t ? $"*{t.Str}*" : v.ToString()!);

        s.Stimulus("borrowed {title}, due back on {date}", (state, title, due) =>
        {
            var loans = LoansOf(state).ToList();
            loans.Add(VMap(("title", title), ("due", due)));
            return new VMap(SMap(state).SetItem("loans", Value.List(loans)));
        });

        s.Stimulus("returns it on {date}", (state, returnedOn) =>
        {
            var returned = ValueDate(returnedOn);
            long fee = LoansOf(state).Sum(loan => Library.LateFee(LoanDue(loan), returned));
            return new VMap(SMap(state).SetItem("fee", Value.Of(fee)));
        });

        s.Sensor("owes a {money} late fee", (state, expected) => state["fee"]);

        s.Sensor("{money} for each day overdue", (state, expected) => Value.Of(Library.FeePerDay));

        s.Stimulus("asks to borrow {title} on {date}", (state, title, on) =>
        {
            var onDate = ValueDate(on);
            var dues = LoansOf(state).Select(LoanDue);
            return new VMap(SMap(state).SetItem("granted", Value.Of(Library.MayBorrow(dues, onDate))));
        });

        s.Sensor("the library refuses", state =>
        {
            if (state["granted"] is VBool { Bool: true })
            {
                throw new HandlerException("expected the library to refuse");
            }

            return null;
        });

        s.Sensor("the library agrees", state =>
        {
            if (state["granted"] is not VBool { Bool: true })
            {
                throw new HandlerException("expected the library to agree");
            }

            return null;
        });

        return s.ToRegistry();
    }
}
