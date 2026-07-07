from var import steps

param, stimulus, sensor = steps(lambda: {})


@sensor("I echo the following:")
def _(state, doc):
    return "goodbye"
