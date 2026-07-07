from var import steps

param, stimulus, sensor = steps(lambda: {})


@stimulus("I have {int} cukes")
def _(state, n):
    pass


@stimulus("I have 5 cukes")
def _(state):
    pass
