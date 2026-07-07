from var import steps

param, stimulus, sensor = steps(lambda: {"count": 0})


@stimulus("I increment")
def _(state):
    return {"count": state["count"] + 1}


@sensor("The count is {int}")
def _(state, n):
    if state["count"] != n:
        raise AssertionError(f"expected {n} but got {state['count']}")
