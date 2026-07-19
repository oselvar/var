using System.Text;

namespace Varar.Example;

// The code under test for roman-numerals.md.
public static class RomanNumerals
{
    private static readonly (string Letter, int Value)[] Numerals =
    {
        ("M", 1000), ("CM", 900), ("D", 500), ("CD", 400), ("C", 100), ("XC", 90),
        ("L", 50), ("XL", 40), ("X", 10), ("IX", 9), ("V", 5), ("IV", 4), ("I", 1),
    };

    public static string ToRoman(int num)
    {
        var result = new StringBuilder();
        foreach (var (letter, value) in Numerals)
        {
            while (num >= value)
            {
                num -= value;
                result.Append(letter);
            }
        }

        return result.ToString();
    }
}
