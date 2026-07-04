package examples;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

final class Yahtzee {

    private Yahtzee() {}

    static int score(List<Integer> dice, String category) {
        Map<Integer, Integer> counts = new HashMap<>();
        for (int d : dice) counts.merge(d, 1, Integer::sum);
        int sum = dice.stream().mapToInt(Integer::intValue).sum();
        StringBuilder sortedBuilder = new StringBuilder();
        dice.stream().sorted().forEach(sortedBuilder::append);
        String sorted = sortedBuilder.toString();
        return switch (category) {
            case "ones" -> sumOf(counts, 1);
            case "twos" -> sumOf(counts, 2);
            case "threes" -> sumOf(counts, 3);
            case "fours" -> sumOf(counts, 4);
            case "fives" -> sumOf(counts, 5);
            case "sixes" -> sumOf(counts, 6);
            case "pair" -> ofAKind(counts, 2);
            case "two pairs" -> {
                List<Integer> pairs = counts.entrySet().stream()
                        .filter(e -> e.getValue() >= 2)
                        .map(Map.Entry::getKey)
                        .toList();
                yield pairs.size() >= 2 ? pairs.stream().mapToInt(face -> 2 * face).sum() : 0;
            }
            case "three of a kind" -> ofAKind(counts, 3);
            case "four of a kind" -> ofAKind(counts, 4);
            case "small straight" -> sorted.equals("12345") ? 15 : 0;
            case "large straight" -> sorted.equals("23456") ? 20 : 0;
            case "full house" -> {
                List<Integer> cs = counts.values().stream().sorted().toList();
                yield counts.size() == 2 && cs.get(0) == 2 && cs.get(1) == 3 ? sum : 0;
            }
            case "Yahtzee" -> counts.size() == 1 ? 50 : 0;
            case "chance" -> sum;
            default -> throw new IllegalArgumentException("Unknown category: " + category);
        };
    }

    private static int sumOf(Map<Integer, Integer> counts, int face) {
        return counts.getOrDefault(face, 0) * face;
    }

    // n-of-a-kind: the highest face appearing at least n times, scored n*face.
    private static int ofAKind(Map<Integer, Integer> counts, int n) {
        return counts.entrySet().stream()
                .filter(e -> e.getValue() >= n)
                .mapToInt(Map.Entry::getKey)
                .max()
                .stream()
                .map(face -> n * face)
                .findFirst()
                .orElse(0);
    }
}
