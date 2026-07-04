from var import define_state
from yahtzee_example import score

stimulus, sensor = define_state(lambda: {})


# Header-bound table: the paragraph names every header cell (dice, category,
# score), so this sensor runs once per row with the row as a dict keyed by
# header. Returning {"score": …} checks that column; the other columns are
# inputs.
@sensor("Examples of dice, category and score")
def _(state, row):
    dice = [int(d.strip()) for d in row["dice"].split(",")]
    return {"score": score(dice, row["category"])}
