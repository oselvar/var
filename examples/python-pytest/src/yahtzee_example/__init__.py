from collections import Counter


def score(dice: list[int], category: str) -> int:
    counts = Counter(dice)
    total = sum(dice)

    def sum_of(face: int) -> int:
        return counts.get(face, 0) * face

    # n-of-a-kind: the highest face appearing at least n times, scored n*face.
    def of_a_kind(n: int) -> int:
        faces = [face for face, c in counts.items() if c >= n]
        return n * max(faces) if faces else 0

    sorted_dice = "".join(str(d) for d in sorted(dice))
    match category:
        case "ones":
            return sum_of(1)
        case "twos":
            return sum_of(2)
        case "threes":
            return sum_of(3)
        case "fours":
            return sum_of(4)
        case "fives":
            return sum_of(5)
        case "sixes":
            return sum_of(6)
        case "pair":
            return of_a_kind(2)
        case "two pairs":
            pairs = [face for face, c in counts.items() if c >= 2]
            return sum(2 * face for face in pairs) if len(pairs) >= 2 else 0
        case "three of a kind":
            return of_a_kind(3)
        case "four of a kind":
            return of_a_kind(4)
        case "small straight":
            return 15 if sorted_dice == "12345" else 0
        case "large straight":
            return 20 if sorted_dice == "23456" else 0
        case "full house":
            cs = sorted(counts.values())
            return total if len(counts) == 2 and cs == [2, 3] else 0
        case "Yahtzee":
            return 50 if len(counts) == 1 else 0
        case "chance":
            return total
        case _:
            raise ValueError(f"Unknown category: {category}")
