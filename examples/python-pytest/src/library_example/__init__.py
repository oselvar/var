FEE_PENCE_PER_DAY = 50


def late_fee(loan, returned_on):
    """Fee in pence for returning a loan: 50p per day past the due date."""
    days_late = max(0, (returned_on - loan["due"]).days)
    return days_late * FEE_PENCE_PER_DAY


def may_borrow(loans, on):
    """A member may borrow as long as none of their loans is overdue."""
    return all(loan["due"] >= on for loan in loans)
