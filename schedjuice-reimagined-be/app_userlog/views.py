from app_auth.models import User
from app_course.course_scoping import acting_user
from app_rbac.resolution import effective_permissions
from app_rbac.views import RBACDetailsView, RBACListView, RBACSearchView, RBACView
from app_userlog import models, serializers, services
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication

_AUTH = [TenantBoundJWTStatelessAuthentication]
_CONFIG = {
    "GET": "userlog.view",
    "PUT": "userlog.configure",
    "PATCH": "userlog.configure",
    "DELETE": "userlog.configure",
}


class ReportTypeListView(RBACListView):
    model = models.ReportType
    serializer = serializers.ReportTypeSerializer
    authentication_classes = _AUTH
    required_permissions = {"GET": "userlog.view", "POST": "userlog.configure"}


class ReportTypeDetailView(RBACDetailsView):
    model = models.ReportType
    serializer = serializers.ReportTypeSerializer
    authentication_classes = _AUTH
    required_permissions = _CONFIG


class ReportTypeFieldsView(RBACView):
    """Read or replace the whole field set for a report type."""

    authentication_classes = _AUTH
    required_permissions = {"GET": "userlog.view", "PUT": "userlog.configure"}

    def get(self, request, obj_id: int):
        qs = models.ReportTypeField.objects.filter(report_type_id=obj_id)
        return self.ok(serializers.ReportTypeFieldSerializer(qs, many=True).data)

    def put(self, request, obj_id: int):
        rt = models.ReportType.objects.filter(pk=obj_id).first()
        if not rt:
            return self.not_found("Report type not found.")
        body = serializers.ReportTypeFieldsReplaceSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        models.ReportTypeField.objects.filter(report_type=rt).delete()
        created = [
            models.ReportTypeField.objects.create(report_type=rt, **field)
            for field in body.validated_data["fields"]
        ]
        return self.ok(serializers.ReportTypeFieldSerializer(created, many=True).data)


def _can_manage_or_own(request, entry) -> bool:
    actor = acting_user(request)
    held = effective_permissions(request.user)
    if "userlog.manage" in held:
        return True
    return entry.author_id == getattr(actor, "id", None)


class UserLogListView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"GET": "userlog.view", "POST": "userlog.create"}

    def get(self, request, user_id: int):
        actor = acting_user(request)
        if actor and actor.id == user_id:
            return self.ok([])
        qs = models.LogEntry.objects.filter(subject_id=user_id, is_deleted=False)
        report_type = request.GET.get("report_type")
        if report_type:
            qs = qs.filter(report_type_id=report_type)
        qs = qs.select_related("report_type", "author")
        return self.ok(serializers.LogEntrySerializer(qs, many=True).data)

    def post(self, request, user_id: int):
        actor = acting_user(request)
        if actor and actor.id == user_id:
            return self.bad_request("You cannot create a log about yourself.")
        subject = User.objects.filter(pk=user_id).first()
        if not subject:
            return self.not_found("User not found.")
        body = serializers.LogEntryInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        report_type = models.ReportType.objects.filter(
            pk=body.validated_data["report_type"]
        ).first()
        if not report_type:
            return self.bad_request("Invalid report type.")
        entry = services.create_entry(
            subject=subject,
            report_type=report_type,
            title=body.validated_data["title"],
            body=body.validated_data.get("body", ""),
            field_values=body.validated_data.get("field_values", {}),
            author=actor,
        )
        return self.created(serializers.LogEntrySerializer(entry).data)


class UserLogDetailView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {
        "GET": "userlog.view",
        "PUT": "userlog.update",
        "PATCH": "userlog.update",
        "DELETE": "userlog.delete",
    }

    def _get(self, request, obj_id):
        actor = acting_user(request)
        entry = (
            models.LogEntry.objects.filter(pk=obj_id, is_deleted=False)
            .select_related("report_type")
            .first()
        )
        if not entry:
            return None, self.not_found("Log entry not found.")
        if actor and entry.subject_id == actor.id:
            return None, self.not_found("Log entry not found.")
        return entry, None

    def get(self, request, obj_id: int):
        entry, err = self._get(request, obj_id)
        if err:
            return err
        return self.ok(serializers.LogEntrySerializer(entry).data)

    def patch(self, request, obj_id: int):
        entry, err = self._get(request, obj_id)
        if err:
            return err
        if not _can_manage_or_own(request, entry):
            return self.forbidden("You can only edit your own log entries.")
        body = serializers.LogEntryUpdateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = dict(body.validated_data)
        if "report_type" in data:
            rt = models.ReportType.objects.filter(pk=data["report_type"]).first()
            if not rt:
                return self.bad_request("Invalid report type.")
            data["report_type"] = rt
        services.update_entry(entry, actor=acting_user(request), data=data)
        entry.refresh_from_db()
        return self.updated(serializers.LogEntrySerializer(entry).data)

    def put(self, request, obj_id: int):
        return self.patch(request, obj_id)

    def delete(self, request, obj_id: int):
        entry, err = self._get(request, obj_id)
        if err:
            return err
        if not _can_manage_or_own(request, entry):
            return self.forbidden("You can only delete your own log entries.")
        services.soft_delete_entry(entry, actor=acting_user(request))
        return self.ok({"id": obj_id, "deleted": True})


class UserLogVersionsView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"GET": "userlog.view"}

    def get(self, request, obj_id: int):
        actor = acting_user(request)
        entry = models.LogEntry.objects.filter(pk=obj_id).first()
        if not entry or (actor and entry.subject_id == actor.id):
            return self.not_found("Log entry not found.")
        qs = entry.versions.select_related("editor")
        return self.ok(
            [
                {
                    "id": v.id,
                    "version_no": v.version_no,
                    "editor": serializers.user_mini(v.editor),
                    "snapshot": v.snapshot,
                    "change_summary": v.change_summary,
                    "created_at": v.created_at,
                }
                for v in qs
            ]
        )


class UserLogTimelineView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"GET": "userlog.view"}

    def get(self, request, obj_id: int):
        actor = acting_user(request)
        entry = models.LogEntry.objects.filter(pk=obj_id).first()
        if not entry or (actor and entry.subject_id == actor.id):
            return self.not_found("Log entry not found.")
        events = entry.events.select_related("actor")
        return self.ok(
            [
                {
                    "id": e.id,
                    "event_type": e.event_type,
                    "level": e.level,
                    "payload": e.payload,
                    "actor": serializers.user_mini(e.actor),
                    "created_at": e.created_at,
                }
                for e in events
            ]
        )


class UserLogSearchView(RBACSearchView):
    model = models.LogEntry
    serializer = serializers.LogEntrySerializer
    authentication_classes = _AUTH
    required_permissions = {"POST": "userlog.view"}

    def augment_search_queryset(self, queryset, expand, is_csv):
        actor = acting_user(self.request)
        queryset = queryset.filter(is_deleted=False)
        if actor is not None:
            queryset = queryset.exclude(subject_id=actor.id)
        return queryset
