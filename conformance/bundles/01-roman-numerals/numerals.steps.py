from var import steps

param, stimulus, sensor = steps(lambda: {})

ROMAN = {1: "I", 4: "IV", 9: "IX", 40: "XL"}


@stimulus("I convert {int} to roman numerals")
def _(state, n):
    return {"result": ROMAN.get(n)}


@sensor("The result is {word}")
def _(state, expected):
    # Strip sentence-ending punctuation captured by {word} when it appears last.
    cleaned = expected.rstrip(".!?")
    if state.get("result") != cleaned:
        raise AssertionError(f"expected {cleaned} but got {state.get('result')}")
