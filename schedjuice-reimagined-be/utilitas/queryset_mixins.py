"""
Declarative mixins for view-level N+1 prevention.

ExpandPrefetchSpec: when a client expand path is requested, replace the default
prefetch on the parent lookup with an optimized Prefetch(queryset=...).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Iterable

from django.db.models import Prefetch, QuerySet


def _normalize(name) -> str:
    return str(name).replace(".", "__")


def expand_includes_prefix(expand: Iterable, prefix: str) -> bool:
    norm = _normalize(prefix)
    for raw in expand or []:
        path = _normalize(raw)
        if path == norm or path.startswith(f"{norm}__"):
            return True
    return False


def strip_translated_expand_prefixes(translated: set[str], prefixes: set[str]) -> set[str]:
    return {
        path
        for path in translated
        if not any(path == p or path.startswith(f"{p}__") for p in prefixes)
    }


@dataclass(frozen=True)
class ExpandPrefetchSpec:
    """
    trigger_expand: client expand path that activates this spec (e.g. "event__course").
    replace_lookup: parent lookup we own and replace (e.g. "event"). The mixin strips
        this lookup (and its descendants) from default prefetches before applying.
    queryset_factory: zero-arg callable returning the optimized queryset to prefetch.
    """

    trigger_expand: str
    replace_lookup: str
    queryset_factory: Callable[[], QuerySet]

    def matches(self, expand) -> bool:
        return expand_includes_prefix(expand, self.trigger_expand)

    def apply(self, queryset: QuerySet) -> QuerySet:
        return queryset.prefetch_related(
            Prefetch(self.replace_lookup, queryset=self.queryset_factory())
        )


class OptimizedSearchMixin:
    """
    Mix into BaseListView / BaseSearchView. Subclasses declare:
      - expand_prefetch_specs: list[ExpandPrefetchSpec]    (replace prefetches based on expand)
      - base_select_related: tuple[str, ...]               (always-on FK joins)
      - base_prefetch_related: tuple[Prefetch | str, ...]  (always-on prefetches)
    """

    expand_prefetch_specs: list[ExpandPrefetchSpec] = []
    base_select_related: tuple[str, ...] = ()
    base_prefetch_related: tuple = ()

    def translate_expand_params(self, expand):
        translated = super().translate_expand_params(expand)
        active = {s.replace_lookup for s in self.expand_prefetch_specs if s.matches(expand)}
        if not active:
            return translated
        return strip_translated_expand_prefixes(translated, active)

    def augment_search_queryset(self, queryset, expand, is_csv):
        queryset = super().augment_search_queryset(queryset, expand, is_csv)
        if self.base_select_related:
            queryset = queryset.select_related(*self.base_select_related)
        for p in self.base_prefetch_related:
            queryset = queryset.prefetch_related(p)
        for spec in self.expand_prefetch_specs:
            if spec.matches(expand):
                queryset = spec.apply(queryset)
        return queryset


class OptimizedDetailMixin:
    """
    Mix into BaseDetailsView. Override `annotate_detail_queryset(queryset)` to add
    annotations / prefetches required by the detail serializer.
    """

    def annotate_detail_queryset(self, queryset):
        return queryset

    def get_object(self, obj_id: int, prefetch_fields=None):
        if prefetch_fields is None:
            prefetch_fields = []
        qs = self.annotate_detail_queryset(self.model.objects.filter(pk=obj_id))
        if prefetch_fields:
            qs = qs.prefetch_related(*prefetch_fields)
        return qs.first()
