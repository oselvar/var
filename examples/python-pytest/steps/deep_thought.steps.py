from var import define_state

stimulus, sensor = define_state(lambda: {})


@sensor("life, the universe and everything is {int}")
def _(state, answer):
    return 42
