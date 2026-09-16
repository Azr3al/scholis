from django.db import models

from utilitas.models import BaseModel


class LeadStatus(BaseModel):
    """Kanban column. Admins CRUD via crm.configure; non-NORMAL behavior is UI-protected from delete."""

    class Behavior(models.TextChoices):
        NORMAL = "NORMAL", "Normal"
        APPOINTMENT = "APPOINTMENT", "Appointment"
        CONVERTED = "CONVERTED", "Converted"
        LOST = "LOST", "Lost"

    name = models.CharField(max_length=255)
    color = models.CharField(max_length=16, default="#64748b")
    order = models.PositiveIntegerField(default=0)
    behavior = models.CharField(
        max_length=16, choices=Behavior.choices, default=Behavior.NORMAL
    )
    is_default = models.BooleanField(default=False)

    chosen_one_fields = ["is_default"]

    class Meta:
        ordering = ["order", "id"]


class LeadSource(BaseModel):
    name = models.CharField(max_length=255, unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]


class Lead(BaseModel):
    name = models.CharField(max_length=512)
    phone = models.CharField(max_length=512, blank=True)
    email = models.EmailField(blank=True)
    facebook_link = models.CharField(max_length=512, blank=True)
    interested_in = models.TextField(blank=True)
    note = models.TextField(blank=True)

    source = models.ForeignKey(
        LeadSource, on_delete=models.PROTECT, related_name="leads"
    )
    status = models.ForeignKey(
        LeadStatus, on_delete=models.PROTECT, related_name="leads"
    )
    assignee = models.ForeignKey(
        "app_auth.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="assigned_leads",
    )
    created_by = models.ForeignKey(
        "app_auth.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_leads",
    )
    converted_user = models.ForeignKey(
        "app_auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="converted_from_lead",
    )
    observers = models.ManyToManyField(
        "app_auth.User",
        blank=True,
        related_name="observed_leads",
    )

    class Meta:
        ordering = ["-created_at"]


class LeadAppointment(BaseModel):
    class Platform(models.TextChoices):
        ZOOM = "ZOOM", "Zoom"
        MEET = "MEET", "Google Meet"
        IN_PERSON = "IN_PERSON", "In person"
        PHONE = "PHONE", "Phone"
        OTHER = "OTHER", "Other"

    class Outcome(models.TextChoices):
        SCHEDULED = "SCHEDULED", "Scheduled"
        DONE = "DONE", "Done"
        NO_SHOW = "NO_SHOW", "No show"
        CANCELLED = "CANCELLED", "Cancelled"

    lead = models.ForeignKey(
        Lead, on_delete=models.CASCADE, related_name="appointments"
    )
    scheduled_at = models.DateTimeField()
    platform = models.CharField(max_length=16, choices=Platform.choices)
    meeting_link = models.CharField(max_length=1024, blank=True)
    consultant = models.ForeignKey(
        "app_auth.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="lead_appointments",
    )
    outcome = models.CharField(
        max_length=16, choices=Outcome.choices, default=Outcome.SCHEDULED
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-scheduled_at", "-id"]


class LeadEvent(BaseModel):
    """Immutable audit entry."""

    class EventType(models.TextChoices):
        CREATED = "created", "Created"
        STATUS_CHANGED = "status_changed", "Status changed"
        APPOINTMENT_BOOKED = "appointment_booked", "Appointment booked"
        APPOINTMENT_RESCHEDULED = "appointment_rescheduled", "Appointment rescheduled"
        APPOINTMENT_NO_SHOW = "appointment_no_show", "Appointment no-show"
        ASSIGNEE_CHANGED = "assignee_changed", "Assignee changed"
        CONVERTED = "converted", "Converted to student"
        OBSERVER_ADDED = "observer_added", "Observer added"

    lead = models.ForeignKey(Lead, on_delete=models.CASCADE, related_name="events")
    actor = models.ForeignKey(
        "app_auth.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="lead_events",
    )
    event_type = models.CharField(max_length=32, choices=EventType.choices)
    payload = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["created_at", "id"]


class LeadComment(BaseModel):
    lead = models.ForeignKey(Lead, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(
        "app_auth.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="lead_comments",
    )
    body = models.TextField()
    mentions = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["created_at", "id"]


class IssueSource(models.TextChoices):
    INTERNAL = "INTERNAL", "Internal"
    PARENT_COMPLAINT = "PARENT_COMPLAINT", "Parent complaint"


class IssueStatus(BaseModel):
    """Kanban column. Admins CRUD via issue.configure; non-NORMAL behavior is UI-protected from delete."""

    class Behavior(models.TextChoices):
        NORMAL = "NORMAL", "Normal"
        DONE = "DONE", "Done"
        CANCELLED = "CANCELLED", "Cancelled"

    name = models.CharField(max_length=255)
    color = models.CharField(max_length=16, default="#64748b")
    order = models.PositiveIntegerField(default=0)
    behavior = models.CharField(
        max_length=16, choices=Behavior.choices, default=Behavior.NORMAL
    )
    is_default = models.BooleanField(default=False)

    chosen_one_fields = ["is_default"]

    class Meta:
        ordering = ["order", "id"]


class Issue(BaseModel):
    title = models.CharField(max_length=512)
    description = models.TextField(blank=True)
    source = models.CharField(
        max_length=32,
        choices=IssueSource.choices,
        default=IssueSource.INTERNAL,
    )
    is_anonymous = models.BooleanField(default=False)

    status = models.ForeignKey(
        IssueStatus, on_delete=models.PROTECT, related_name="issues"
    )
    assignee = models.ForeignKey(
        "app_auth.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="assigned_issues",
    )
    created_by = models.ForeignKey(
        "app_auth.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_issues",
    )
    related_student = models.ForeignKey(
        "app_auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="related_issues",
    )
    related_course = models.ForeignKey(
        "app_course.Course",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="related_issues",
    )
    observers = models.ManyToManyField(
        "app_auth.User",
        blank=True,
        related_name="observed_issues",
    )

    class Meta:
        ordering = ["-created_at"]


class IssueEvent(BaseModel):
    """Immutable audit entry."""

    class EventType(models.TextChoices):
        CREATED = "created", "Created"
        STATUS_CHANGED = "status_changed", "Status changed"
        ASSIGNEE_CHANGED = "assignee_changed", "Assignee changed"
        OBSERVER_ADDED = "observer_added", "Observer added"

    issue = models.ForeignKey(Issue, on_delete=models.CASCADE, related_name="events")
    actor = models.ForeignKey(
        "app_auth.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="issue_events",
    )
    event_type = models.CharField(max_length=32, choices=EventType.choices)
    payload = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["created_at", "id"]


class IssueComment(BaseModel):
    issue = models.ForeignKey(Issue, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(
        "app_auth.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="issue_comments",
    )
    body = models.TextField()
    mentions = models.JSONField(default=list, blank=True)
    attachments = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["created_at", "id"]
