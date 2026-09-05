SLOT_DURATION_MINUTES = 30

WEEKDAY_KEYS = (
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
)


def slot_blocking_statuses() -> tuple[str, ...]:
    return ("pending", "confirmed")
