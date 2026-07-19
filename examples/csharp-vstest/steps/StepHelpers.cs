using System.Collections.Immutable;
using Varar.Core;

namespace Varar.Example;

// Small Value helpers shared by the step files, mirroring the Rust sample's
// vmap/smap/as_str/as_int. State is a full-replacement Value (varar-core's model):
// a stimulus reads the current state map and returns the whole next state.
internal static class StepHelpers
{
    public static Value VMap(params (string Key, Value Value)[] pairs) =>
        Value.Map(pairs.Select(p => new KeyValuePair<string, Value>(p.Key, p.Value)));

    public static ImmutableDictionary<string, Value> SMap(Value v) =>
        v is VMap m ? m.Entries : ImmutableDictionary<string, Value>.Empty;

    public static string AsStr(Value v) => v.AsString();

    public static long AsInt(Value v) => v.AsInt();
}
