"""Simple substring search for the platform-admin Organizations list."""
from __future__ import annotations

from django.db.models import Q, QuerySet

SEARCH_FIELDS = ("name", "domain_url")


def apply_organization_search_q(queryset: QuerySet, q: str) -> QuerySet:
    q = (q or "").strip()
    if not q:
        return queryset
    qs = queryset
    for word in q.split():
        word_q = Q()
        for field_name in SEARCH_FIELDS:
            word_q |= Q(**{f"{field_name}__icontains": word})
        qs = qs.filter(word_q)
    return qs
