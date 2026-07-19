// C# sibling of numerals.steps.ts / .rs (bundle 01-roman-numerals).
// Full-replacement state: the {result} map is the whole state.
using Varar;
using Varar.Core;

namespace Varar.Corpus.B01;

public static class NumeralsSteps
{
    public static Registry Register(Registry r)
    {
        var s = Steps.From(r);

        s.Stimulus("I convert {int} to roman numerals", (state, n) =>
        {
            var roman = Roman(n.AsInt());
            return roman is null ? Value.Map([]) : Value.Map([new("result", Value.Of(roman))]);
        });

        s.Sensor("The result is {word}", (state, expected) =>
        {
            // {word} greedily captures trailing punctuation ("I." not "I"); strip it, then throw
            // on mismatch (returning would compare the raw "I." and wrongly fail).
            var cleaned = expected.AsString().TrimEnd('.', '!', '?');
            var result = ResultOf(state);
            if (cleaned != result)
            {
                throw new HandlerException($"expected {cleaned} but got {result}");
            }

            return null;
        });

        return s.ToRegistry();
    }

    public static Value State() => Value.Map([]);

    private static string? Roman(long n) => n switch
    {
        1 => "I",
        4 => "IV",
        9 => "IX",
        40 => "XL",
        _ => null,
    };

    private static string ResultOf(Value state) =>
        state is VMap m && m.Entries.TryGetValue("result", out var v) && v is VString s ? s.Str : string.Empty;
}
