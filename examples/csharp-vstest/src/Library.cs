using System.Globalization;
using System.Linq;

namespace Varar.Example;

// The code under test for library.md. Money is whole pennies; dates are stored as
// (year, month, day) and compared via a day serial number (days from the epoch).
public static class Library
{
    public const long FeePerDay = 50;

    private static readonly string[] Months =
    {
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    };

    public readonly record struct Date(long Year, long Month, long Day)
    {
        public long Serial()
        {
            long y = Month <= 2 ? Year - 1 : Year;
            long era = (y >= 0 ? y : y - 399) / 400;
            long yoe = y - era * 400;
            long doy = (153 * (Month > 2 ? Month - 3 : Month + 9) + 2) / 5 + Day - 1;
            long doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
            return era * 146097 + doe - 719468;
        }
    }

    public static Date ParseDate(string raw)
    {
        var comma = raw.Split(", ");
        var monthDay = comma[0].Split(' ');
        long month = Array.IndexOf(Months, monthDay[0]) + 1;
        return new Date(long.Parse(comma[1], CultureInfo.InvariantCulture), month, long.Parse(monthDay[1], CultureInfo.InvariantCulture));
    }

    public static string FormatDate(Date d) => $"{Months[d.Month - 1]} {d.Day}, {d.Year}";

    public static long ParseMoney(string raw)
    {
        if (raw.EndsWith("p", StringComparison.Ordinal))
        {
            return long.Parse(raw[..^1], CultureInfo.InvariantCulture);
        }

        if (raw.StartsWith("£", StringComparison.Ordinal))
        {
            return (long)Math.Round(double.Parse(raw[1..], CultureInfo.InvariantCulture) * 100.0);
        }

        throw new FormatException($"not money: {raw}");
    }

    public static string FormatMoney(long pennies) =>
        pennies < 100 ? $"{pennies}p" : $"£{(pennies / 100.0).ToString("F2", CultureInfo.InvariantCulture)}";

    public static long LateFee(Date due, Date returnedOn) =>
        Math.Max(0, returnedOn.Serial() - due.Serial()) * FeePerDay;

    public static bool MayBorrow(IEnumerable<Date> dues, Date on) =>
        dues.All(due => due.Serial() >= on.Serial());
}
