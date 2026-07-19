using System.Linq;

namespace Varar.Example;

// The code under test for yahtzee.md.
public static class Yahtzee
{
    public static int Score(IReadOnlyList<int> dice, string category)
    {
        var counts = new Dictionary<int, int>();
        foreach (var d in dice)
        {
            counts[d] = counts.GetValueOrDefault(d) + 1;
        }

        int total = dice.Sum();
        int SumOf(int face) => counts.GetValueOrDefault(face) * face;
        int OfAKind(int n)
        {
            var faces = counts.Where(kv => kv.Value >= n).Select(kv => kv.Key).ToList();
            return faces.Count > 0 ? n * faces.Max() : 0;
        }

        var sorted = string.Concat(dice.OrderBy(d => d));

        return category switch
        {
            "ones" => SumOf(1),
            "twos" => SumOf(2),
            "threes" => SumOf(3),
            "fours" => SumOf(4),
            "fives" => SumOf(5),
            "sixes" => SumOf(6),
            "pair" => OfAKind(2),
            "two pairs" => TwoPairs(counts),
            "three of a kind" => OfAKind(3),
            "four of a kind" => OfAKind(4),
            "small straight" => sorted == "12345" ? 15 : 0,
            "large straight" => sorted == "23456" ? 20 : 0,
            "full house" => FullHouse(counts, total),
            "Yahtzee" => counts.Count == 1 ? 50 : 0,
            "chance" => total,
            _ => throw new ArgumentException($"Unknown category: {category}"),
        };
    }

    private static int TwoPairs(Dictionary<int, int> counts)
    {
        var pairs = counts.Where(kv => kv.Value >= 2).Select(kv => kv.Key).ToList();
        return pairs.Count >= 2 ? pairs.Sum(face => 2 * face) : 0;
    }

    private static int FullHouse(Dictionary<int, int> counts, int total)
    {
        var cs = counts.Values.OrderBy(c => c).ToList();
        return counts.Count == 2 && cs[0] == 2 && cs[1] == 3 ? total : 0;
    }
}
