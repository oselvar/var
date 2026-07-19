// C# sibling of airports.steps.ts / .rs (bundle 13-custom-parameter-type).
using Varar;
using Varar.Core;

namespace Varar.Corpus.B13;

public static class AirportsSteps
{
    public static Registry Register(Registry r)
    {
        var s = Steps.From(r);

        // Custom {airport} parameter type: IATA code, lowercased by parse. The sensor asserts the
        // lowercasing, so an identity parse would fail.
        s.Param("airport", "[A-Z]{3}", g => Value.Of(g[0]!.ToLowerInvariant()));

        s.Stimulus("I fly to {airport}", (state, dest) => Value.Map([new("dest", dest)]));

        s.Sensor("The destination code is {word}", (state, expected) =>
        {
            var cleaned = expected.AsString().TrimEnd('.', '!', '?');
            var dest = DestOf(state);
            if (cleaned != dest)
            {
                throw new HandlerException($"expected {cleaned} but got {dest}");
            }

            return null;
        });

        return s.ToRegistry();
    }

    public static Value State() => Value.Null;

    private static string DestOf(Value state) =>
        state is VMap m && m.Entries.TryGetValue("dest", out var v) && v is VString s ? s.Str : string.Empty;
}
