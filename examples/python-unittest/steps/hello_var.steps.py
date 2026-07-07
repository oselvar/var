from var import steps

param, stimulus, sensor = steps(lambda: {"greeting": "", "result": 0})


@stimulus("I greet {string}")
def _(state, name):
    return {"greeting": f"Hello, {name}!"}


@sensor("the greeting should be {string}")
def _(state, expected):
    return state["greeting"]


@stimulus("expression `{int}+{int}`")
def _(state, a, b):
    return {"result": a + b}


@sensor("evaluate to `{int}`")
def _(state, expected):
    return state["result"]
