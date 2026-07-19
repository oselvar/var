namespace Varar.Core;

public static class Hash
{
    /// <summary>
    /// FNV-1a (32-bit) change-detector over UTF-16 code units. Not a security hash — tiny and
    /// trivially portable. The <c>fnv1a:</c> prefix namespaces the algorithm. Port of <c>hash.ts</c>.
    /// </summary>
    public static string HashSource(string source)
    {
        uint h = 0x811c9dc5;
        foreach (char c in source)
        {
            h ^= c;
            h *= 0x01000193u; // uint multiply wraps mod 2^32 (unchecked by default)
        }

        return $"fnv1a:{h:x8}";
    }
}
