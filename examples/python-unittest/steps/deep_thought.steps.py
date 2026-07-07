from var import steps

param, stimulus, sensor = steps()


@sensor("life, the universe and everything is {int}")
def _(state, answer):
    return 42
