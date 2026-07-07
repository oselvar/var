from var import steps

# Custom {money} parameter type with a `format` — the inverse of `parse`,
# rendering a value back in the document's notation. The sensor returns the
# WRONG Money on purpose: the golden pins the formatted actual ("£2.60"),
# proving every port renders parameter mismatches through `format`
# identically. Without a format this actual would be each port's native
# object rendering, which is deliberately outside conformance.
param, stimulus, sensor = steps(lambda: {})
param(
    "money",
    r"£\d+\.\d{2}",
    parse=lambda raw: {"currency": "GBP", "value": float(raw[1:])},
    format=lambda m: f"£{m['value']:.2f}",
)


@sensor("The late fee is {money}")
def _(state, fee):
    return {"currency": "GBP", "value": 2.6}
