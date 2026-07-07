from roman_numerals_example import to_roman
from var import steps

param, stimulus, sensor = steps()


@sensor("a decimal and a roman number")
def _(state, row):
    return {"decimal": row["decimal"], "roman": to_roman(int(row["decimal"]))}
