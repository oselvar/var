from var import steps

param, stimulus, sensor = steps(lambda: {})


@sensor("I report the score and grade")
def _(state, row=None):
    return {"score": "99", "grade": "A"}
