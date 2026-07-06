from var import define_state

# No state factory: these steps are pure, so define_state() is called bare
# and handlers get an empty dict as state.
stimulus, sensor = define_state()


@stimulus("I warm up my mental math")
def _(state):
    pass


@sensor("The square of {int} is {int}.")
def _(state, n, expected):
    return [n, n * n]
