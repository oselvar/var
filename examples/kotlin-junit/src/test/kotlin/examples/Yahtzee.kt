package examples

fun score(dice: List<Int>, category: String): Int {
    val counts = dice.groupingBy { it }.eachCount()
    val sum = dice.sum()
    fun sumOf(face: Int) = (counts[face] ?: 0) * face
    // n-of-a-kind: the highest face appearing at least n times, scored n*face.
    fun ofAKind(n: Int): Int {
        val faces = counts.filterValues { it >= n }.keys
        return if (faces.isNotEmpty()) n * faces.max() else 0
    }
    val sorted = dice.sorted().joinToString("")
    return when (category) {
        "ones" -> sumOf(1)
        "twos" -> sumOf(2)
        "threes" -> sumOf(3)
        "fours" -> sumOf(4)
        "fives" -> sumOf(5)
        "sixes" -> sumOf(6)
        "pair" -> ofAKind(2)
        "two pairs" -> {
            val pairs = counts.filterValues { it >= 2 }.keys
            if (pairs.size >= 2) pairs.sumOf { 2 * it } else 0
        }
        "three of a kind" -> ofAKind(3)
        "four of a kind" -> ofAKind(4)
        "small straight" -> if (sorted == "12345") 15 else 0
        "large straight" -> if (sorted == "23456") 20 else 0
        "full house" -> {
            val cs = counts.values.sorted()
            if (counts.size == 2 && cs[0] == 2 && cs[1] == 3) sum else 0
        }
        "Yahtzee" -> if (counts.size == 1) 50 else 0
        "chance" -> sum
        else -> throw IllegalArgumentException("Unknown category: $category")
    }
}
