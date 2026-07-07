from var import steps

# No state factory: these steps are pure, so steps() is called bare
# and handlers get an empty dict as state.
param, stimulus, sensor = steps()


@stimulus("I warm up my mental math")
def _(state):
    pass


@sensor("The square of {int} is {int}.")
def _(state, n, expected):
    return [n, n * n]
