package examples;

import java.util.List;
import java.util.Map;

final class RomanNumerals {

    private RomanNumerals() {}

    private static final List<Map.Entry<String, Integer>> NUMERALS = List.of(
            Map.entry("M", 1000),
            Map.entry("CM", 900),
            Map.entry("D", 500),
            Map.entry("CD", 400),
            Map.entry("C", 100),
            Map.entry("XC", 90),
            Map.entry("L", 50),
            Map.entry("XL", 40),
            Map.entry("X", 10),
            Map.entry("IX", 9),
            Map.entry("V", 5),
            Map.entry("IV", 4),
            Map.entry("I", 1));

    static String toRoman(int num) {
        StringBuilder result = new StringBuilder();
        for (Map.Entry<String, Integer> numeral : NUMERALS) {
            while (num >= numeral.getValue()) {
                num -= numeral.getValue();
                result.append(numeral.getKey());
            }
        }
        return result.toString();
    }
}
