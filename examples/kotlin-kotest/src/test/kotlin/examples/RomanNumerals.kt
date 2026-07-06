package examples

private val NUMERALS =
    listOf(
        "M" to 1000,
        "CM" to 900,
        "D" to 500,
        "CD" to 400,
        "C" to 100,
        "XC" to 90,
        "L" to 50,
        "XL" to 40,
        "X" to 10,
        "IX" to 9,
        "V" to 5,
        "IV" to 4,
        "I" to 1,
    )

fun toRoman(num: Int): String {
    var remaining = num
    val result = StringBuilder()
    for ((letter, value) in NUMERALS) {
        while (remaining >= value) {
            remaining -= value
            result.append(letter)
        }
    }
    return result.toString()
}
