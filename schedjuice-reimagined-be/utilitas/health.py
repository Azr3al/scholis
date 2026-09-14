"""Process liveness endpoint. No auth, no database access."""

from django.http import JsonResponse


def health(_request):
    return JsonResponse(
        {
            "isError": False,
            "message": "ok",
            "data": {"status": "ok"},
        }
    )
