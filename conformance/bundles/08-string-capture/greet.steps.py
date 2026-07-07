from var import steps

param, stimulus, sensor = steps(lambda: {})


@stimulus("I greet {string}")
def _(state, s):
    pass
