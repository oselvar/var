from varar import steps

# The two Given/And paragraphs each carry a table and are separated from each
# other by a blank line (valid GFM). They must merge into ONE example that
# shares state, so the sensor reads back 1 user and 1 asset. The second example
# — separated by the prose paragraph — starts from a fresh, empty basket and
# reads back 0 and 0, proving the prose paragraph is a delimiter. See ADR 0012.
param, stimulus, sensor = steps(lambda: {"users": [], "assets": []})


@stimulus("the following users have been imported")
def _(state, rows):
    return {**state, "users": [row[0] for row in rows[1:]]}


@stimulus("the following assets have been imported")
def _(state, rows):
    return {**state, "assets": [row[0] for row in rows[1:]]}


@sensor("the basket contains {int} user(s) and {int} asset(s)")
def _(state, users, assets):
    return [len(state["users"]), len(state["assets"])]
