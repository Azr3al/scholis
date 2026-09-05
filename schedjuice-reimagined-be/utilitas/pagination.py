import logging
import math

from rest_framework.pagination import PageNumberPagination

_SCHEDJUICE_ALL_PAGE_SIZE_CACHE = "_schedjuice_all_records_page_size"

logger = logging.getLogger(__name__)


class CustomPagination(PageNumberPagination):
    page_size_query_param = "size"
    page_size = 10
    page_query_param = "page"
    max_page_size = 200

    def paginate_queryset(self, queryset, request, view=None):
        raw = request.query_params.get(self.page_size_query_param)
        if raw is not None:
            try:
                if int(raw) == -1:
                    count = queryset.count()
                    resolved = count if count != 0 else self.page_size
                    if count > self.max_page_size:
                        # Ranks which size=-1 callers pull big payloads, so the
                        # unpaginated escape hatch can eventually be clamped.
                        logger.warning(
                            "size=-1 large result: path=%s count=%s",
                            request.path,
                            count,
                        )
                    setattr(request, _SCHEDJUICE_ALL_PAGE_SIZE_CACHE, resolved)
            except (TypeError, ValueError):
                pass
        return super().paginate_queryset(queryset, request, view)

    def get_page_size(self, request):
        raw = request.query_params.get(self.page_size_query_param, 10)
        try:
            parsed = int(raw)
        except (TypeError, ValueError):
            return super().get_page_size(request)
        if parsed == -1:
            cached = getattr(request, _SCHEDJUICE_ALL_PAGE_SIZE_CACHE, None)
            if cached is not None:
                return cached
            return self.page_size
        if parsed > self.max_page_size:
            return self.max_page_size
        if parsed < 1:
            return self.page_size
        return parsed

    def get_count_per_page(self):
        return len(list(self.page))

    def get_total_pages(self):
        return math.ceil(self.page.paginator.count / self.get_page_size(self.request))

    def get_paginated_response(self, *args, **kwargs):
        return {
            "links": {
                "next": self.get_next_link(),
                "previous": self.get_previous_link(),
            },
            "count": self.page.paginator.count,
            "count_per_page": self.get_count_per_page(),
            "total_pages": self.get_total_pages(),
        }
