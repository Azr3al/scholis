from django.db.models import ProtectedError, RestrictedError
from rest_framework import status
from rest_framework.views import Response, exception_handler


def _protected_error_message(exc) -> str:
    """Build a user-facing message listing what still references the object."""
    protected = getattr(exc, "protected_objects", None) or getattr(
        exc, "restricted_objects", None
    )
    names = []
    if protected:
        for obj in protected:
            label = getattr(obj, "title", None) or getattr(obj, "name", None) or str(obj)
            names.append(str(label))
            if len(names) >= 5:
                break

    base = (
        "Cannot delete this record because other records still reference it. "
        "Remove or reassign them first"
    )
    if names:
        return f"{base} (e.g. {', '.join(names)})."
    return f"{base}."


def custom_handler(exc, ctx):
    response = exception_handler(exc, ctx)

    # ProtectedError / RestrictedError are raised by Django on delete() when an
    # on_delete=PROTECT/RESTRICT relation still points at the object. They are not
    # DRF APIExceptions, so the default handler returns None and the client would
    # otherwise get an opaque 500. Surface them as a normal validation error.
    if response is None and isinstance(exc, (ProtectedError, RestrictedError)):
        return Response(
            {
                "isError": True,
                "details": {"non_field_errors": [_protected_error_message(exc)]},
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    custom_response = {"isError": True}
    if hasattr(exc, "status_code"):
        custom_response["details"] = response.data

        return Response(custom_response, status=exc.status_code)

    return response
