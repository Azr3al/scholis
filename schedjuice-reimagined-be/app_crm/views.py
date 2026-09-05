from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from rest_framework.exceptions import ValidationError

from app_auth.user_search import apply_user_search_q
from app_course.course_scoping import acting_user
from app_crm import models, serializers, services
from app_crm.complaint_notifications import (
    notify_complaint_created,
    notify_complaint_reopened,
    notify_complaint_reply,
)
from app_crm.complaint_helpers import (
    build_parent_complaint_title,
    crm_enabled_or_404,
    description_from_complaint_body,
    is_complaint_student_actor,
    redact_timeline_actor_for_staff,
    should_redact_complaint_identity,
    student_safe_timeline_items,
    validate_complaint_message_body,
)
from app_rbac.views import RBACDetailsView, RBACListView, RBACSearchView, RBACView
from app_utils.board_observers import (
    add_observers_from_mentions,
    email_observers_on_status_change,
    mention_user_ids,
    users_with_permission,
    validate_mention_user_ids,
)
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication

_AUTH = [TenantBoundJWTStatelessAuthentication]


def _mention_candidates(qs, q: str):
    q = (q or "").strip()
    if q:
        qs = apply_user_search_q(qs, q)
    return [user for user in qs if not user.is_student()][:20]
_CONFIG = {
    "GET": "lead.view",
    "POST": "crm.configure",
    "PUT": "crm.configure",
    "PATCH": "crm.configure",
    "DELETE": "crm.configure",
}
_ISSUE_CONFIG = {
    "GET": "issue.view",
    "POST": "issue.configure",
    "PUT": "issue.configure",
    "PATCH": "issue.configure",
    "DELETE": "issue.configure",
}


class _ComplaintAwareIssueMixin:
    _student_required_permissions: dict = {}

    def initial(self, request, *args, **kwargs):
        actor = acting_user(request)
        if (
            actor
            and is_complaint_student_actor(actor)
            and self._student_required_permissions
        ):
            self.required_permissions = dict(self._student_required_permissions)
        super().initial(request, *args, **kwargs)


def _get_issue_for_actor(request, obj_id: int):
    actor = acting_user(request)
    if is_complaint_student_actor(actor):
        crm_enabled_or_404(request.tenant)
        return (
            models.Issue.objects.filter(
                pk=obj_id,
                source=models.IssueSource.PARENT_COMPLAINT,
                related_student=actor,
            ).first()
        )
    return models.Issue.objects.filter(pk=obj_id).first()


def _issue_is_closed(issue: models.Issue) -> bool:
    behavior = issue.status.behavior
    return behavior in (
        models.IssueStatus.Behavior.DONE,
        models.IssueStatus.Behavior.CANCELLED,
    )


def _complaint_list_filters(request):
    actor = acting_user(request)
    if is_complaint_student_actor(actor):
        crm_enabled_or_404(request.tenant)
        return Q(
            source=models.IssueSource.PARENT_COMPLAINT,
            related_student=actor,
        )
    source = (request.query_params.get("source") or "").strip()
    if source in (
        models.IssueSource.INTERNAL,
        models.IssueSource.PARENT_COMPLAINT,
    ):
        return Q(source=source)
    return Q()


def _create_parent_complaint(request, actor):
    body_ser = serializers.StudentCreateComplaintSerializer(data=request.data)
    body_ser.is_valid(raise_exception=True)
    data = body_ser.validated_data
    attachments = list(data.get("attachments") or [])
    try:
        normalized_body = validate_complaint_message_body(
            body=data.get("body", ""),
            attachments=attachments,
            user=actor,
        )
    except DjangoValidationError as exc:
        details = exc.message_dict if hasattr(exc, "message_dict") else str(exc)
        raise ValidationError(details) from exc

    default_status = models.IssueStatus.objects.filter(is_default=True).first()
    is_anonymous = bool(data.get("is_anonymous"))
    issue = models.Issue.objects.create(
        title=build_parent_complaint_title(actor, is_anonymous=is_anonymous),
        description=description_from_complaint_body(normalized_body, attachments),
        source=models.IssueSource.PARENT_COMPLAINT,
        related_student=actor,
        created_by=actor,
        is_anonymous=is_anonymous,
        assignee=None,
        status=default_status,
    )
    models.IssueComment.objects.create(
        issue=issue,
        author=actor,
        body=normalized_body,
        attachments=attachments,
    )
    services.record_issue_event(
        issue, actor, models.IssueEvent.EventType.CREATED, {}
    )
    notify_complaint_created(issue, request.tenant)
    return issue


class LeadListView(RBACListView):
    model = models.Lead
    serializer = serializers.LeadSerializer
    authentication_classes = _AUTH
    required_permissions = {"GET": "lead.view", "POST": "lead.create"}

    def post(self, request):
        data = dict(request.data)
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        actor = acting_user(request)
        lead = serializer.save(created_by=actor, assignee=actor)
        lead.observers.add(actor)
        services.record_event(lead, actor, models.LeadEvent.EventType.CREATED, {})
        return self.created(self.get_serializer(lead).data)


class LeadDetailView(RBACDetailsView):
    model = models.Lead
    serializer = serializers.LeadSerializer
    authentication_classes = _AUTH
    required_permissions = {
        "GET": "lead.view",
        "PUT": "lead.update",
        "PATCH": "lead.update",
        "DELETE": "lead.delete",
    }


class LeadSearchView(RBACSearchView):
    model = models.Lead
    serializer = serializers.LeadSerializer
    authentication_classes = _AUTH
    required_permissions = {"POST": "lead.view"}


class LeadMoveView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"POST": "lead.update"}

    def post(self, request, obj_id: int):
        lead = models.Lead.objects.filter(pk=obj_id).first()
        if not lead:
            return self.not_found("Lead not found.")
        body = serializers.LeadMoveSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        target = models.LeadStatus.objects.filter(
            pk=body.validated_data["status"]
        ).first()
        if not target:
            return self.bad_request("Invalid status.")
        actor = acting_user(request)
        try:
            services.move_lead(
                lead,
                target,
                actor=actor,
                appointment=body.validated_data.get("appointment"),
                student_data=body.validated_data.get("student"),
            )
        except (services.AppointmentRequired, services.StudentDataRequired) as exc:
            return self.bad_request(str(exc))
        lead.refresh_from_db()
        email_observers_on_status_change(
            tenant=request.tenant,
            entity=lead,
            actor=actor,
            subject=f"Lead status updated: {lead.name}",
            body_html=f"<p><strong>{lead.name}</strong> moved to <strong>{lead.status.name}</strong>.</p>",
            toggle_attr="notify_lead_observers_on_status_change",
        )
        return self.ok(serializers.LeadSerializer(lead).data)


class LeadConvertView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"POST": "lead.update"}

    def post(self, request, obj_id: int):
        lead = models.Lead.objects.filter(pk=obj_id).first()
        if not lead:
            return self.not_found("Lead not found.")
        body = serializers.StudentInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            student = services.convert_lead_to_student(
                lead,
                actor=acting_user(request),
                student_data=body.validated_data,
            )
        except services.StudentDataRequired as exc:
            return self.bad_request(str(exc))
        lead.refresh_from_db()
        return self.ok(
            {
                "lead": serializers.LeadSerializer(lead).data,
                "student_id": student.id,
            }
        )


class LeadAppointmentListView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"GET": "lead.view", "POST": "lead.update"}

    def get(self, request, obj_id: int):
        qs = models.LeadAppointment.objects.filter(lead_id=obj_id)
        return self.ok(serializers.LeadAppointmentSerializer(qs, many=True).data)

    def post(self, request, obj_id: int):
        lead = models.Lead.objects.filter(pk=obj_id).first()
        if not lead:
            return self.not_found("Lead not found.")
        body = serializers.AppointmentInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        appt = services.create_appointment(
            lead, acting_user(request), body.validated_data
        )
        return self.created(serializers.LeadAppointmentSerializer(appt).data)


class LeadAppointmentDetailView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"PATCH": "lead.update"}

    def patch(self, request, obj_id: int):
        appt = models.LeadAppointment.objects.filter(pk=obj_id).first()
        if not appt:
            return self.not_found("Appointment not found.")
        body = serializers.AppointmentUpdateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        actor = acting_user(request)

        if "scheduled_at" in data:
            appt.scheduled_at = data["scheduled_at"]
            services.record_event(
                appt.lead,
                actor,
                models.LeadEvent.EventType.APPOINTMENT_RESCHEDULED,
                {
                    "appointment_id": appt.id,
                    "scheduled_at": str(data["scheduled_at"]),
                },
            )
        if "platform" in data:
            appt.platform = data["platform"]
        if "consultant" in data:
            appt.consultant_id = data["consultant"]
        if "meeting_link" in data:
            appt.meeting_link = data["meeting_link"]
        if "notes" in data:
            appt.notes = data["notes"]
        if "outcome" in data:
            outcome = data["outcome"]
            appt.outcome = outcome
            if outcome == models.LeadAppointment.Outcome.NO_SHOW:
                services.record_event(
                    appt.lead,
                    actor,
                    models.LeadEvent.EventType.APPOINTMENT_NO_SHOW,
                    {"appointment_id": appt.id},
                )
        appt.save()
        return self.updated(serializers.LeadAppointmentSerializer(appt).data)


class LeadCommentListView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"GET": "lead.view", "POST": "lead.view"}

    def get(self, request, obj_id: int):
        qs = models.LeadComment.objects.filter(lead_id=obj_id)
        return self.ok(serializers.LeadCommentSerializer(qs, many=True).data)

    def post(self, request, obj_id: int):
        lead = models.Lead.objects.filter(pk=obj_id).first()
        if not lead:
            return self.not_found("Lead not found.")
        body = (request.data.get("body") or "").strip()
        if not body:
            raise ValidationError({"body": "Comment body is required."})
        mentions = request.data.get("mentions") or []
        try:
            ids = validate_mention_user_ids(
                mention_user_ids(mentions), permission_code="lead.view"
            )
        except DjangoValidationError as exc:
            return self.bad_request(
                exc.message_dict if hasattr(exc, "message_dict") else str(exc)
            )
        actor = acting_user(request)
        comment = models.LeadComment.objects.create(
            lead=lead,
            author=actor,
            body=body,
            mentions=mentions,
        )
        added = add_observers_from_mentions(lead, ids, actor=actor)
        if added:
            services.record_event(
                lead,
                actor,
                models.LeadEvent.EventType.OBSERVER_ADDED,
                {"user_ids": added, "via": "mention"},
            )
        return self.created(serializers.LeadCommentSerializer(comment).data)


class LeadTimelineView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"GET": "lead.view"}

    def get(self, request, obj_id: int):
        events = models.LeadEvent.objects.filter(lead_id=obj_id).select_related("actor")
        comments = models.LeadComment.objects.filter(lead_id=obj_id).select_related(
            "author"
        )
        items = []
        for event in events:
            items.append(
                {
                    "kind": "event",
                    "id": event.id,
                    "event_type": event.event_type,
                    "payload": event.payload,
                    "actor": serializers.user_mini(event.actor),
                    "created_at": event.created_at,
                }
            )
        for comment in comments:
            items.append(
                {
                    "kind": "comment",
                    "id": comment.id,
                    "body": comment.body,
                    "actor": serializers.user_mini(comment.author),
                    "created_at": comment.created_at,
                }
            )
        items.sort(key=lambda item: item["created_at"])
        return self.ok(items)


class LeadMentionCandidatesView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"GET": "lead.view"}

    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        qs = users_with_permission("lead.view").order_by("name", "email")
        candidates = _mention_candidates(qs, q)
        return self.ok([serializers.user_mini(u) for u in candidates])


class LeadObserverListView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"POST": "lead.update"}

    def post(self, request, obj_id: int):
        lead = models.Lead.objects.filter(pk=obj_id).first()
        if not lead:
            return self.not_found("Lead not found.")
        body = serializers.ObserverInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        user_id = body.validated_data["user_id"]
        try:
            validate_mention_user_ids([user_id], permission_code="lead.view")
        except DjangoValidationError as exc:
            return self.bad_request(
                exc.message_dict if hasattr(exc, "message_dict") else str(exc)
            )
        actor = acting_user(request)
        added = add_observers_from_mentions(lead, [user_id], actor=actor)
        if added:
            services.record_event(
                lead,
                actor,
                models.LeadEvent.EventType.OBSERVER_ADDED,
                {"user_ids": added, "via": "manual"},
            )
        return self.created(serializers.LeadSerializer(lead, expand=["observers"]).data)


class LeadObserverDetailView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"DELETE": "lead.update"}

    def delete(self, request, obj_id: int, user_id: int):
        lead = models.Lead.objects.filter(pk=obj_id).first()
        if not lead:
            return self.not_found("Lead not found.")
        lead.observers.remove(user_id)
        return self.deleted(serializers.LeadSerializer(lead, expand=["observers"]).data)


class LeadStatusListView(RBACListView):
    model = models.LeadStatus
    serializer = serializers.LeadStatusSerializer
    authentication_classes = _AUTH
    required_permissions = {"GET": "lead.view", "POST": "crm.configure"}


class LeadStatusDetailView(RBACDetailsView):
    model = models.LeadStatus
    serializer = serializers.LeadStatusSerializer
    authentication_classes = _AUTH
    required_permissions = _CONFIG


class LeadSourceListView(RBACListView):
    model = models.LeadSource
    serializer = serializers.LeadSourceSerializer
    authentication_classes = _AUTH
    required_permissions = {"GET": "lead.view", "POST": "crm.configure"}


class LeadSourceDetailView(RBACDetailsView):
    model = models.LeadSource
    serializer = serializers.LeadSourceSerializer
    authentication_classes = _AUTH
    required_permissions = _CONFIG


class IssueListView(_ComplaintAwareIssueMixin, RBACListView):
    model = models.Issue
    serializer = serializers.IssueSerializer
    authentication_classes = _AUTH
    required_permissions = {"GET": "issue.view", "POST": "issue.create"}
    _student_required_permissions = {
        "GET": "complaint.view_own",
        "POST": "complaint.create",
    }

    def get_queryset(
        self,
        request,
        filter_params=None,
        exclude_params=None,
        is_csv=False,
        fields=None,
        sorts=None,
        expand=None,
        filter_ids=None,
        chained_filter_params=None,
    ):
        if filter_params is None:
            filter_params = {}
        if chained_filter_params is None:
            chained_filter_params = []
        source_filter = _complaint_list_filters(request)
        chained_filter_params = [source_filter, *list(chained_filter_params)]
        return super().get_queryset(
            request,
            filter_params=filter_params,
            exclude_params=exclude_params,
            is_csv=is_csv,
            fields=fields,
            sorts=sorts,
            expand=expand,
            filter_ids=filter_ids,
            chained_filter_params=chained_filter_params,
        )

    def post(self, request):
        actor = acting_user(request)
        if is_complaint_student_actor(actor):
            crm_enabled_or_404(request.tenant)
            issue = _create_parent_complaint(request, actor)
            return self.created(self.get_serializer(issue).data)

        data = dict(request.data)
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        issue = serializer.save(created_by=actor, assignee=actor)
        issue.observers.add(actor)
        services.record_issue_event(
            issue, actor, models.IssueEvent.EventType.CREATED, {}
        )
        return self.created(self.get_serializer(issue).data)


class IssueDetailView(_ComplaintAwareIssueMixin, RBACDetailsView):
    model = models.Issue
    serializer = serializers.IssueSerializer
    authentication_classes = _AUTH
    required_permissions = {
        "GET": "issue.view",
        "PUT": "issue.update",
        "PATCH": "issue.update",
        "DELETE": "issue.delete",
    }
    _student_required_permissions = {"GET": "complaint.view_own"}

    def get(self, request, obj_id: int):
        if is_complaint_student_actor(acting_user(request)):
            issue = _get_issue_for_actor(request, obj_id)
            if issue is None:
                return self.send_not_found(obj_id)
            query_params = self.get_query_params(request)
            query_params.pop("sorts")
            serialized_data = self.get_serializer(issue, **query_params)
            return self.ok(serialized_data.data)
        return super().get(request, obj_id)


class IssueMoveView(_ComplaintAwareIssueMixin, RBACView):
    authentication_classes = _AUTH
    required_permissions = {"POST": "issue.update"}
    _student_required_permissions = {"POST": "complaint.reopen"}

    def post(self, request, obj_id: int):
        actor = acting_user(request)
        if is_complaint_student_actor(actor):
            issue = _get_issue_for_actor(request, obj_id)
            if not issue:
                return self.not_found("Issue not found.")
            body = serializers.StudentComplaintReopenSerializer(data=request.data)
            body.is_valid(raise_exception=True)
            open_status = models.IssueStatus.objects.filter(is_default=True).first()
            status_id = body.validated_data.get("status")
            if status_id is None:
                target = open_status
            else:
                target = models.IssueStatus.objects.filter(pk=status_id).first()
            if not target:
                return self.bad_request("Invalid status.")
            if open_status is None or target.id != open_status.id:
                return self.forbidden(
                    "Students may only reopen complaints to Open status."
                )
            if not _issue_is_closed(issue):
                return self.bad_request("Only closed complaints can be reopened.")
            services.move_issue(issue, target, actor=actor)
            issue.refresh_from_db()
            notify_complaint_reopened(issue, request.tenant)
            return self.ok(serializers.IssueSerializer(issue).data)

        issue = models.Issue.objects.filter(pk=obj_id).first()
        if not issue:
            return self.not_found("Issue not found.")
        body = serializers.IssueMoveSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        target = models.IssueStatus.objects.filter(
            pk=body.validated_data["status"]
        ).first()
        if not target:
            return self.bad_request("Invalid status.")
        services.move_issue(issue, target, actor=actor)
        issue.refresh_from_db()
        email_observers_on_status_change(
            tenant=request.tenant,
            entity=issue,
            actor=actor,
            subject=f"Issue status updated: {issue.title}",
            body_html=f"<p><strong>{issue.title}</strong> moved to <strong>{issue.status.name}</strong>.</p>",
            toggle_attr="notify_issue_observers_on_status_change",
        )
        return self.ok(serializers.IssueSerializer(issue).data)


class IssueCommentListView(_ComplaintAwareIssueMixin, RBACView):
    authentication_classes = _AUTH
    required_permissions = {"GET": "issue.view", "POST": "issue.view"}
    _student_required_permissions = {
        "GET": "complaint.view_own",
        "POST": "complaint.comment",
    }

    def get(self, request, obj_id: int):
        if is_complaint_student_actor(acting_user(request)):
            issue = _get_issue_for_actor(request, obj_id)
            if not issue:
                return self.not_found("Issue not found.")
            qs = models.IssueComment.objects.filter(issue=issue)
            return self.ok(serializers.IssueCommentSerializer(qs, many=True).data)
        qs = models.IssueComment.objects.filter(issue_id=obj_id)
        return self.ok(serializers.IssueCommentSerializer(qs, many=True).data)

    def post(self, request, obj_id: int):
        actor = acting_user(request)
        if is_complaint_student_actor(actor):
            issue = _get_issue_for_actor(request, obj_id)
            if not issue:
                return self.not_found("Issue not found.")
            if _issue_is_closed(issue):
                return self.forbidden(
                    message="This complaint is closed. Reopen to reply.",
                )
            attachments = request.data.get("attachments") or []
            try:
                body = validate_complaint_message_body(
                    body=request.data.get("body", ""),
                    attachments=attachments,
                    user=actor,
                )
            except DjangoValidationError as exc:
                return self.bad_request(
                    exc.message_dict if hasattr(exc, "message_dict") else str(exc)
                )
            comment = models.IssueComment.objects.create(
                issue=issue,
                author=actor,
                body=body,
                attachments=list(attachments),
            )
            return self.created(serializers.IssueCommentSerializer(comment).data)

        issue = models.Issue.objects.filter(pk=obj_id).first()
        if not issue:
            return self.not_found("Issue not found.")
        body = (request.data.get("body") or "").strip()
        if not body:
            raise ValidationError({"body": "Comment body is required."})
        mentions = request.data.get("mentions") or []
        try:
            ids = validate_mention_user_ids(
                mention_user_ids(mentions), permission_code="issue.view"
            )
        except DjangoValidationError as exc:
            return self.bad_request(
                exc.message_dict if hasattr(exc, "message_dict") else str(exc)
            )
        comment = models.IssueComment.objects.create(
            issue=issue,
            author=actor,
            body=body,
            mentions=mentions,
        )
        added = add_observers_from_mentions(issue, ids, actor=actor)
        if added:
            services.record_issue_event(
                issue,
                actor,
                models.IssueEvent.EventType.OBSERVER_ADDED,
                {"user_ids": added, "via": "mention"},
            )
        if issue.source == models.IssueSource.PARENT_COMPLAINT and issue.related_student_id:
            notify_complaint_reply(issue, request.tenant, issue.related_student_id)
        return self.created(serializers.IssueCommentSerializer(comment).data)


class IssueTimelineView(_ComplaintAwareIssueMixin, RBACView):
    authentication_classes = _AUTH
    required_permissions = {"GET": "issue.view"}
    _student_required_permissions = {"GET": "complaint.view_own"}

    def get(self, request, obj_id: int):
        if is_complaint_student_actor(acting_user(request)):
            issue = _get_issue_for_actor(request, obj_id)
            if not issue:
                return self.not_found("Issue not found.")
            events = models.IssueEvent.objects.filter(issue=issue).select_related(
                "actor"
            )
            comments = models.IssueComment.objects.filter(issue=issue).select_related(
                "author"
            )
            items = student_safe_timeline_items(events, comments)
            return self.ok(items)

        events = models.IssueEvent.objects.filter(issue_id=obj_id).select_related(
            "actor"
        )
        comments = models.IssueComment.objects.filter(issue_id=obj_id).select_related(
            "author"
        )
        issue = models.Issue.objects.filter(pk=obj_id).first()
        redact_identity = (
            issue is not None
            and should_redact_complaint_identity(issue, acting_user(request))
        )
        related_student_id = issue.related_student_id if issue else None
        items = []
        for event in events:
            item = {
                "kind": "event",
                "id": event.id,
                "event_type": event.event_type,
                "payload": event.payload,
                "actor": serializers.user_mini(event.actor),
                "created_at": event.created_at,
            }
            if redact_identity:
                item = redact_timeline_actor_for_staff(
                    item, related_student_id=related_student_id
                )
            items.append(item)
        for comment in comments:
            item = {
                "kind": "comment",
                "id": comment.id,
                "body": comment.body,
                "attachments": list(comment.attachments or []),
                "actor": serializers.user_mini(comment.author),
                "created_at": comment.created_at,
            }
            if redact_identity:
                item = redact_timeline_actor_for_staff(
                    item, related_student_id=related_student_id
                )
            items.append(item)
        items.sort(key=lambda item: item["created_at"])
        return self.ok(items)


class IssueMentionCandidatesView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"GET": "issue.view"}

    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        qs = users_with_permission("issue.view").order_by("name", "email")
        candidates = _mention_candidates(qs, q)
        return self.ok([serializers.user_mini(u) for u in candidates])


class IssueObserverListView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"POST": "issue.update"}

    def post(self, request, obj_id: int):
        issue = models.Issue.objects.filter(pk=obj_id).first()
        if not issue:
            return self.not_found("Issue not found.")
        body = serializers.ObserverInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        user_id = body.validated_data["user_id"]
        try:
            validate_mention_user_ids([user_id], permission_code="issue.view")
        except DjangoValidationError as exc:
            return self.bad_request(
                exc.message_dict if hasattr(exc, "message_dict") else str(exc)
            )
        actor = acting_user(request)
        added = add_observers_from_mentions(issue, [user_id], actor=actor)
        if added:
            services.record_issue_event(
                issue,
                actor,
                models.IssueEvent.EventType.OBSERVER_ADDED,
                {"user_ids": added, "via": "manual"},
            )
        return self.created(
            serializers.IssueSerializer(issue, expand=["observers"]).data
        )


class IssueObserverDetailView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"DELETE": "issue.update"}

    def delete(self, request, obj_id: int, user_id: int):
        issue = models.Issue.objects.filter(pk=obj_id).first()
        if not issue:
            return self.not_found("Issue not found.")
        issue.observers.remove(user_id)
        return self.deleted(
            serializers.IssueSerializer(issue, expand=["observers"]).data
        )


class IssueStatusListView(RBACListView):
    model = models.IssueStatus
    serializer = serializers.IssueStatusSerializer
    authentication_classes = _AUTH
    required_permissions = {"GET": "issue.view", "POST": "issue.configure"}


class IssueStatusDetailView(RBACDetailsView):
    model = models.IssueStatus
    serializer = serializers.IssueStatusSerializer
    authentication_classes = _AUTH
    required_permissions = _ISSUE_CONFIG
