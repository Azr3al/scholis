from rest_framework.request import Request

from app_auth.views import RBACView


class UserInsightsDuplicateSearchView(RBACView):
    """POST /users/insights/duplicates/search — student duplicate clusters."""

    required_permissions = {"POST": "course.view_all"}

    def post(self, request: Request):
        from app_auth.user_insights_services import (
            DuplicateClusterFilters,
            build_duplicate_clusters,
            load_student_rows,
        )

        body = request.data if isinstance(request.data, dict) else {}
        filters = DuplicateClusterFilters(
            q=body.get("q"),
            include_inactive=bool(body.get("include_inactive")),
            page=max(1, int(body.get("page") or 1)),
            size=int(body.get("size") or 25),
        )
        users = load_student_rows(filters.include_inactive)
        summary, results, count = build_duplicate_clusters(users, filters)
        return self.send_response(
            False,
            "success",
            {
                "data": {"summary": summary, "results": results},
                "page": filters.page,
                "size": filters.size,
                "count": count,
            },
            status=200,
        )


class MicrosoftSignInActivityView(RBACView):
    """POST /users/microsoft-sign-in-activity — batch MS last sign-in."""

    required_permissions = {"POST": "course.view_all"}

    def post(self, request: Request):
        from app_auth.ms_sign_in_activity import fetch_sign_in_activity_for_users
        from app_auth.models import User

        body = request.data if isinstance(request.data, dict) else {}
        raw = body.get("user_ids") or []
        try:
            user_ids = [int(i) for i in raw[:50]]
        except (TypeError, ValueError):
            return self.bad_request("user_ids must be a list of integers.")

        users = {u.id: u for u in User.objects.filter(id__in=user_ids)}
        data = fetch_sign_in_activity_for_users(request.tenant, users)
        return self.ok(data)


class UserInsightsMergePreviewView(RBACView):
    """POST /users/insights/merge/preview"""

    required_permissions = {"POST": "course.manage_all"}

    def post(self, request: Request):
        from app_auth.user_merge_services import (
            MergeValidationError,
            build_merge_preview,
            validate_merge_request,
        )

        body = request.data if isinstance(request.data, dict) else {}
        try:
            merge_req, _cluster, survivor, absorbed = validate_merge_request(body)
        except (MergeValidationError, TypeError, ValueError) as exc:
            return self.bad_request(str(exc))
        preview = build_merge_preview(survivor, absorbed, merge_req)
        return self.ok(preview)


class UserInsightsMergeApplyView(RBACView):
    """POST /users/insights/merge/apply"""

    required_permissions = {"POST": "course.manage_all"}

    def post(self, request: Request):
        from app_auth.user_merge_services import (
            MergeValidationError,
            apply_user_merge,
            validate_merge_request,
        )
        from app_course.views import acting_user

        body = request.data if isinstance(request.data, dict) else {}
        try:
            merge_req, _cluster, survivor, absorbed = validate_merge_request(body)
        except (MergeValidationError, TypeError, ValueError) as exc:
            return self.bad_request(str(exc))
        result = apply_user_merge(
            survivor=survivor,
            absorbed_users=absorbed,
            request=merge_req,
            actor=acting_user(request),
        )
        return self.ok(result)
