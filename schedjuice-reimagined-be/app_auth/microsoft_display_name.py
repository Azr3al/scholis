MS_DISPLAY_NAME_MAX_LENGTH = 256


def resolve_microsoft_display_name(*, raw: str | None, name: str) -> str:
    value = (raw or "").strip() or (name or "").strip()
    return value[:MS_DISPLAY_NAME_MAX_LENGTH]
