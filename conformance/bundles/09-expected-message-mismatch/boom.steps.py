from var import steps

param, stimulus, sensor = steps(lambda: {})


@stimulus("I always boom")
def _(state):
    raise RuntimeError("actual different error")
