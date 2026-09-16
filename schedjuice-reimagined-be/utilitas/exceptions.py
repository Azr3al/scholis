from typing import NoReturn

from rest_framework.exceptions import ValidationError


def field_validation_error(field: str, message: str) -> NoReturn:
    raise ValidationError({field: message})


def field_validation_errors(errors: dict[str, str]) -> NoReturn:
    raise ValidationError(errors)
