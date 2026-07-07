from var import steps

param, stimulus, sensor = steps(lambda: {})


@sensor("I greet {string}")
def _(state, s, *extra):
    return None
