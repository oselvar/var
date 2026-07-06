from datetime import date

from library_example import FEE_PENCE_PER_DAY, late_fee, may_borrow
from var import define_state

MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
]


def to_date(raw):
    """June 6th → date(2026, 6, 6) (the spec's year is 2026)."""
    month, day = raw.split(" ")
    return date(2026, MONTHS.index(month) + 1, int(day[:-2]))


def to_pence(raw):
    """£2.50 and 50p, both as pence."""
    return round(float(raw[1:]) * 100) if raw.startswith("£") else int(raw[:-1])


stimulus, sensor = define_state(
    lambda: {"loans": (), "fee_pence": 0, "granted": False},
    {
        "date": {
            "regexp": (
                r"(?:January|February|March|April|May|June"
                r"|July|August|September|October|November|December)"
                r" \d{1,2}(?:st|nd|rd|th)"
            ),
            "transformer": to_date,
        },
        "money": {"regexp": r"£\d+(?:\.\d{2})?|\d+p", "transformer": to_pence},
        # Emphasis (*Emma*) is stripped before matching, so a title is a
        # Title Case run in the plain prose.
        "title": {"regexp": r"[A-Z][a-z]+(?: [A-Z][a-z]+)*"},
    },
)


@stimulus("borrowed {title}, due back on {date}")
def _(state, title, due):
    return {"loans": (*state["loans"], {"title": title, "due": due})}


@stimulus("returns it on {date}")
def _(state, returned_on):
    return {"fee_pence": sum(late_fee(loan, returned_on) for loan in state["loans"])}


@sensor("owes a {money} late fee")
def _(state, expected):
    return state["fee_pence"]


@sensor("{money} for each day overdue")
def _(state, expected):
    return FEE_PENCE_PER_DAY


@stimulus("asks to borrow {title} on {date}")
def _(state, title, on):
    return {"granted": may_borrow(state["loans"], on)}


@sensor("the library refuses")
def _(state):
    if state["granted"]:
        raise AssertionError("expected the library to refuse")


@sensor("the library agrees")
def _(state):
    if not state["granted"]:
        raise AssertionError("expected the library to agree")
