from var import steps

param, stimulus, sensor = steps(lambda: {})


@stimulus("I divide {int} by {int}")
def _(state, a, b):
    if b == 0:
        raise ZeroDivisionError("division by zero")
