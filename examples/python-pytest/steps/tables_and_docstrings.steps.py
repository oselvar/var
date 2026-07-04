from var import define_state

stimulus, sensor = define_state(lambda: {})


# Whole-table mode: the table arrives as a list of rows (header row first).
# It is this sensor's only slot, so return the reproduced table bare — Vár
# compares every cell.
@sensor("Uppercase each one:")
def _(state, rows):
    return [{"before": before, "after": before.upper()} for before, *_ in rows[1:]]


# Doc-string mode: two slots ({word} plus the trailing doc string), so return
# one element per slot.
@sensor("Greet {word}:")
def _(state, name, doc):
    return [name, f"Hello, {name}!\n"]
