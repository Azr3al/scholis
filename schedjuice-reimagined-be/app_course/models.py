from django.contrib.postgres.indexes import GinIndex
from django.contrib.postgres.fields import ArrayField
from django.contrib.postgres.search import SearchVectorField
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import BooleanField, ExpressionWrapper, Q, UniqueConstraint
from django.db.models.expressions import RawSQL
from django.utils import timezone as django_timezone
from rest_framework.exceptions import ValidationError

from app_auth.models import User
from app_custom_fields.models import CustomDataMixin
from app_tasks.models import Task
from utilitas.models import BaseModel, PostgresGeneratedColumnMixin
import string
import random


def generate_join_code():
    alphabet = string.ascii_letters + string.digits
    while True:
        code = ''.join(random.choice(alphabet) for i in range(6))
        if not Course.objects.filter(join_code__iexact=code).exists():
            return code


class Category(PostgresGeneratedColumnMixin, BaseModel):
    """
    A category for Course and Quiz models.
    """

    postgres_generated_column_attnames = ("search_vector",)

    name = models.CharField(max_length=1024, unique=True)
    description = models.TextField(blank=True, null=True)
    sort_order = models.PositiveIntegerField(default=0)
    is_payment_assignment_eligible = models.BooleanField(
        default=True,
        help_text="If True, courses in this category are eligible for MS Teams payment assignment creation.",
    )
    search_text = models.TextField(blank=True, default="")
    search_vector = SearchVectorField(editable=False, null=True)

    class Meta:
        ordering = ["sort_order", "name"]

    def delete(self, using=None, keep_parents=False):
        if self.courses.exists():
            raise ValidationError(
                {
                    "non_field_errors": [
                        "Cannot delete a category that has courses assigned to it."
                    ]
                }
            )
        return super().delete(using=using, keep_parents=keep_parents)


class Campus(BaseModel):
    """
    Represents a physical or online campus
    """
    name = models.CharField(max_length=255, unique=True)
    description = models.CharField(max_length=512)
    location = models.CharField(max_length=255, null=True, blank=True)
    is_online = models.BooleanField(default=False)
    is_default = models.BooleanField(default=False)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    geofence_radius_meters = models.PositiveIntegerField(default=100)

    chosen_one_fields = ["is_default"]

    @property
    def has_geofence(self) -> bool:
        return self.latitude is not None and self.longitude is not None


class Subject(BaseModel):
    """
    A subject for Course (e.g. Mathematics, Physics).
    Tenant-scoped: each organization has its own subjects.
    """

    class ExamBoard(models.TextChoices):
        EDEXCEL = "EdExcel", "EdExcel"
        CIE = "CIE", "CIE"

    name = models.CharField(max_length=512, unique=True)
    description = models.TextField(blank=True, null=True)
    exam_board = models.CharField(
        max_length=16,
        choices=ExamBoard.choices,
        null=True,
        blank=True,
    )


class Program(BaseModel):
    """
    Curriculum / scheduling configuration for a group of courses.
    Every course belongs to exactly one program.
    """

    class CourseCreationMethod(models.TextChoices):
        MANUAL = "manual", "manual"
        INTAKE_BASED = "intake_based", "intake_based"

    class SubjectStrategy(models.TextChoices):
        NONE = "none", "none"
        OPTIONAL = "optional", "optional"
        REQUIRED = "required", "required"
        MULTI = "multi", "multi"

    name = models.CharField(max_length=512, unique=True)
    description = models.TextField(blank=True, null=True)
    course_creation_method = models.CharField(
        max_length=32,
        choices=CourseCreationMethod.choices,
        default=CourseCreationMethod.MANUAL,
    )
    subject_strategy = models.CharField(
        max_length=32,
        choices=SubjectStrategy.choices,
        default=SubjectStrategy.OPTIONAL,
    )
    is_session_credit_scheduling = models.BooleanField(
        default=False,
        help_text="When true, courses in this program use click-calendar session-credit scheduling.",
    )
    default_max_sessions = models.PositiveIntegerField(
        default=8,
        validators=[MinValueValidator(1), MaxValueValidator(365)],
        help_text="Default max sessions seeded onto new session-credit courses.",
    )
    is_substitution_reserve_enabled = models.BooleanField(
        default=False,
        help_text=(
            "When true, session-credit courses may add buffer days beyond max sessions."
        ),
    )
    default_substitution_reserve_days = models.PositiveIntegerField(
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(10)],
        help_text="Max substitution-reserve days staff can add per course (0–10).",
    )
    allow_multiple_sessions_per_day = models.BooleanField(
        default=False,
        help_text=(
            "When true, session-credit courses may schedule more than one "
            "session on the same calendar date."
        ),
    )
    is_default = models.BooleanField(default=False)
    is_protected = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    chosen_one_fields = ["is_default"]

    class Meta:
        ordering = ["name"]

    def delete(self, using=None, keep_parents=False):
        if self.is_protected:
            raise ValidationError(
                {"non_field_errors": ["Cannot delete a protected program."]}
            )
        if self.courses.exists():
            raise ValidationError(
                {
                    "non_field_errors": [
                        "Cannot delete a program that has courses assigned to it."
                    ]
                }
            )
        return super().delete(using=using, keep_parents=keep_parents)


class ProgramSubject(BaseModel):
    program = models.ForeignKey(
        Program, on_delete=models.CASCADE, related_name="program_subjects"
    )
    subject = models.ForeignKey(
        Subject, on_delete=models.PROTECT, related_name="program_subjects"
    )
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["sort_order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["program", "subject"],
                name="uniq_program_subject_program_subject",
            )
        ]


class ProgramLevel(BaseModel):
    program = models.ForeignKey(
        Program, on_delete=models.CASCADE, related_name="levels"
    )
    name = models.CharField(max_length=512)
    sort_order = models.PositiveIntegerField(default=0)
    default_category = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="program_levels",
    )
    default_capacity = models.PositiveIntegerField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["sort_order", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["program", "name"],
                name="uniq_program_level_program_name",
            )
        ]


class ProgramLevelSection(BaseModel):
    level = models.ForeignKey(
        ProgramLevel, on_delete=models.CASCADE, related_name="sections"
    )
    name = models.CharField(max_length=64)
    sort_order = models.PositiveIntegerField(default=0)
    default_teacher = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="default_program_level_sections",
    )
    default_campus = models.ForeignKey(
        Campus,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="program_level_sections",
    )
    default_capacity = models.PositiveIntegerField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["sort_order", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["level", "name"],
                name="uniq_program_level_section_level_name",
            )
        ]


class ProgramLevelSubject(BaseModel):
    level = models.ForeignKey(
        ProgramLevel, on_delete=models.CASCADE, related_name="level_subjects"
    )
    subject = models.ForeignKey(
        Subject, on_delete=models.PROTECT, related_name="program_level_subjects"
    )
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["sort_order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["level", "subject"],
                name="uniq_program_level_subject_level_subject",
            )
        ]


class Intake(BaseModel):
    name = models.CharField(max_length=512)
    program = models.ForeignKey(
        Program, on_delete=models.PROTECT, related_name="intakes"
    )
    start_date = models.DateField()
    end_date = models.DateField()
    description = models.TextField(blank=True, default="")
    generation_defaults = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-start_date", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["program", "name"],
                name="uniq_intake_program_name",
            )
        ]

    def save(self, *args, **kwargs):
        if self.end_date <= self.start_date:
            raise ValidationError(
                {"end_date": "Intake ending date cannot be before the starting date."}
            )
        return super().save(*args, **kwargs)


class Course(CustomDataMixin, PostgresGeneratedColumnMixin, BaseModel):
    """
    Represents a course. A course can have many teaching sessions, lab sessions, etc. Those are called Events.
    A teacher can be assigned to many courses. A course cannot have multiple teachers.
    """

    postgres_generated_column_attnames = ("search_vector",)

    class CourseStatus(models.TextChoices):
        PLANNED = "planned", "planned"
        ACTIVE = "active", "active"
        ENDED = "ended", "ended"
        PAUSED = "paused", "paused"

    title = models.CharField(max_length=512, unique=True)
    code = models.CharField(max_length=512, null=True, blank=False)
    description = models.CharField(max_length=512, null=True, blank=True)
    start_date = models.DateField()
    end_date = models.DateField()
    max_sessions = models.PositiveIntegerField(
        null=True,
        blank=True,
        validators=[MaxValueValidator(365)],
        help_text="Session-credit cap. Null on weekly programs.",
    )
    meeting_link = models.CharField(max_length=1024, null=True, blank=True)
    meeting_scheduled_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the current meeting_link was last set or changed (server-managed audit).",
    )

    batch_number = models.CharField(null=True, blank=True, max_length=32)
    status = models.CharField(
        choices=CourseStatus.choices, default=CourseStatus.PLANNED, max_length=16
    )

    class StatusOverride(models.TextChoices):
        PAUSED = "paused", "paused"
        ENDED = "ended", "ended"

    status_override = models.CharField(
        max_length=16,
        choices=StatusOverride.choices,
        null=True,
        blank=True,
        help_text="Manual status override (paused or ended). When set, date-based status is ignored.",
    )
    status_override_reason = models.CharField(max_length=512, null=True, blank=True)
    status_override_at = models.DateTimeField(null=True, blank=True)
    status_override_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    default_daily_note = models.JSONField(null=True, blank=True)

    repeat_every = ArrayField(models.CharField(max_length=512), null=True, blank=True)
    is_recurring = models.BooleanField(default=False)
    is_close_on_sabbath = models.BooleanField(default=False)

    join_code = models.CharField(max_length=512, unique=True, null=True, blank=True, default=generate_join_code)
    is_join_code_enabled = models.BooleanField(default=True)
    join_code_expiry_date = models.DateTimeField(null=True, blank=True)

    main_teacher_count = models.PositiveIntegerField(default=None, null=True)
    assistant_teacher_count = models.PositiveIntegerField(default=None,null=True)
    student_count = models.PositiveIntegerField(default=None, null=True)

    class CourseType(models.TextChoices):
        WD = "WD", "WD"
        WE = "WE", "WE"
        OTHER = "OTHER", "OTHER"
    course_type = models.CharField(choices=CourseType.choices, max_length=16, null=True)

    class ExamBoard(models.TextChoices):
        EDEXCEL = "EdExcel", "EdExcel"
        CIE = "CIE", "CIE"

    is_payment_enabled = models.BooleanField(default=True)
    payment_plan = models.ForeignKey("app_finance.PaymentPlan", on_delete=models.SET_NULL, null=True)

    microsoft_group_id = models.CharField(max_length=512, null=True)
    microsoft_channel_id = models.CharField(max_length=512, null=True)
    microsoft_meeting_id = models.CharField(max_length=512, null=True, blank=True)
    zoom_meeting_id = models.CharField(
        max_length=512,
        null=True,
        blank=True,
        help_text="Zoom meeting UUID or ID for report/participant APIs (per course).",
    )
    zoom_account_id = models.CharField(
        max_length=128,
        null=True,
        blank=True,
        help_text="External Zoom account_id of the connected ZoomAccount for OAuth and reports.",
    )

    class ZoomMeetingSource(models.TextChoices):
        SCHOOL = "school", "School Zoom"
        PERSONAL = "personal", "Teacher personal Zoom"

    zoom_meeting_source = models.CharField(
        max_length=16,
        choices=ZoomMeetingSource.choices,
        default=ZoomMeetingSource.SCHOOL,
        db_index=True,
    )
    zoom_personal_user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        help_text="When zoom_meeting_source is personal: teacher whose Zoom OAuth is used.",
    )
    zoom_meeting_uuid = models.CharField(
        max_length=512,
        null=True,
        blank=True,
        help_text="Zoom meeting UUID (Reports API / refresh-from-Zoom).",
    )
    zoom_meeting_host_id = models.CharField(
        max_length=128,
        null=True,
        blank=True,
        help_text="Zoom user_id of the meeting host when known.",
    )
    microsoft_meeting_organizer_id = models.CharField(
        max_length=512,
        null=True,
        blank=True,
        help_text="Azure AD object ID of the meeting organizer (main teacher). Used for Graph paths under /users/{id}/onlineMeetings/...",
    )
    microsoft_calendar_event_id = models.CharField(
        max_length=512,
        null=True,
        blank=True,
        help_text="Outlook calendar event id when the Teams meeting was created via calendar API.",
    )
    meeting_join_id = models.CharField(
        max_length=64,
        null=True,
        blank=True,
        help_text="Teams meeting ID for dial-in/join (from joinMeetingIdSettings).",
    )
    meeting_passcode = models.CharField(
        max_length=64,
        null=True,
        blank=True,
        help_text="Teams meeting passcode for dial-in (from joinMeetingIdSettings).",
    )
    telegram_chat_id = models.BigIntegerField(null=True, blank=True)
    telegram_chat_title = models.CharField(max_length=256, null=True, blank=True)
    telegram_invite_link = models.CharField(max_length=512, null=True, blank=True)
    telegram_linked_at = models.DateTimeField(null=True, blank=True)

    category = models.ForeignKey(
        Category, on_delete=models.PROTECT, related_name="courses"
    )

    program = models.ForeignKey(
        Program, on_delete=models.PROTECT, related_name="courses"
    )
    intake = models.ForeignKey(
        Intake,
        on_delete=models.PROTECT,
        related_name="courses",
        null=True,
        blank=True,
    )
    level = models.ForeignKey(
        ProgramLevel,
        on_delete=models.PROTECT,
        related_name="courses",
        null=True,
        blank=True,
    )
    section = models.ForeignKey(
        ProgramLevelSection,
        on_delete=models.PROTECT,
        related_name="courses",
        null=True,
        blank=True,
    )

    campus = models.ForeignKey(
        Campus, on_delete=models.SET_NULL, null=True, blank=True, related_name="courses"
    )

    created_by = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="created_courses", null=True, blank=True
    )

    subject = models.ForeignKey(
        Subject, on_delete=models.SET_NULL, null=True, blank=True, related_name="courses"
    )
    exam_session_date = models.DateTimeField(null=True, blank=True)
    exam_board = models.CharField(
        choices=ExamBoard.choices, max_length=16, null=True, blank=True
    )
    id_card_expiry_date = models.DateField(null=True, blank=True)

    search_text = models.TextField(blank=True, default="")
    search_vector = SearchVectorField(editable=False, null=True)

    class Meta:
        indexes = [
            GinIndex(
                fields=["custom_data"],
                name="course_custom_data_gin",
                opclasses=["jsonb_path_ops"],
            ),
        ]
        constraints = [
            models.CheckConstraint(
                check=ExpressionWrapper(
                    RawSQL("jsonb_typeof(custom_data) = 'object'", []),
                    output_field=BooleanField(),
                ),
                name="course_custom_data_is_object",
            ),
        ]

    def delete(self, using=None, keep_parents=False):
        if self.microsoft_group_id:
            task = Task(
                name=Task.TaskName.DELETE_COURSE, data={"id": self.microsoft_group_id}
            )
            task.save()
        if self.telegram_chat_id:
            Task(
                name=Task.TaskName.LEAVE_TELEGRAM_GROUP,
                data={"chat_id": self.telegram_chat_id},
            ).save()

        return super().delete(using=using, keep_parents=keep_parents)

    @staticmethod
    def _normalized_meeting_link(value):
        if value is None:
            return None
        stripped = str(value).strip()
        return stripped if stripped else None

    def save(self, *args, **kwargs):
        if not self.join_code:
            self.join_code = generate_join_code()

        update_fields = kwargs.get("update_fields")
        if update_fields is None or "meeting_link" in update_fields:
            prev_link = None
            if self.pk:
                prev_link = (
                    type(self)
                    .objects.filter(pk=self.pk)
                    .values_list("meeting_link", flat=True)
                    .first()
                )
            prev_key = self._normalized_meeting_link(prev_link)
            new_key = self._normalized_meeting_link(self.meeting_link)
            if prev_key != new_key:
                self.meeting_scheduled_at = (
                    django_timezone.now() if new_key else None
                )
                if update_fields is not None and isinstance(update_fields, (list, tuple)):
                    uf = list(update_fields)
                    if "meeting_scheduled_at" not in uf:
                        uf.append("meeting_scheduled_at")
                    kwargs["update_fields"] = uf

        if self.end_date <= self.start_date:
            raise ValidationError(
                {"end_date": "Course ending date cannot be before the starting date."}
            )

        return super().save(*args, **kwargs)


class CourseSubject(BaseModel):
    course = models.ForeignKey(
        Course, on_delete=models.CASCADE, related_name="course_subjects"
    )
    subject = models.ForeignKey(
        Subject, on_delete=models.PROTECT, related_name="course_subjects"
    )
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["course", "subject"],
                name="uniq_course_subject_course_subject",
            )
        ]


class AssignedAsRole(BaseModel):
    class Seniority(models.TextChoices):
        MAIN_TEACHER = "MAIN_TEACHER", "MAIN_TEACHER"
        ASSISTANT_TEACHER = "ASSISTANT_TEACHER", "ASSISTANT_TEACHER"
        OTHER = "OTHER", "OTHER"

    name = models.CharField(max_length=512, unique=True)
    is_collision_enabled = models.BooleanField(
        default=False,
        help_text="If disabled, event collision calculation will be ignored.",
    )
    is_substitute = models.BooleanField(
        default=False,
        help_text=(
            "Substitute roles cover specific session dates only and can auto-expire. "
            "Requires Main Teacher or Assistant Teacher seniority."
        ),
    )
    seniority = models.CharField(choices=Seniority.choices, max_length=100, null=True, default=Seniority.OTHER)


class OpenUserCourseManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().filter(left_at__isnull=True)


class UserCourse(BaseModel):
    """
    Bridge table between User and Course
    """

    class AssignedAs(models.TextChoices):
        TEACHER = "teacher", "teacher"
        STUDENT = "student", "student"

    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="user_courses"
    )
    course = models.ForeignKey(
        Course, on_delete=models.CASCADE, related_name="user_courses"
    )
    assigned_as = models.CharField(choices=AssignedAs.choices)
    assigned_as_role = models.ForeignKey(
        AssignedAsRole, null=True, on_delete=models.PROTECT
    )
    hourly_rate = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True,
        help_text="Course-specific hourly rate for this teacher. Overrides User.per_hour_rate when org supports it.",
    )
    substitute_auto_remove_on = models.DateField(
        null=True,
        blank=True,
        help_text=(
            "Local date of the last covered session for a substitute assignment. "
            "The remove-expired-substitutes cron removes this row the day after."
        ),
    )
    joined_at = models.DateTimeField(default=django_timezone.now)
    left_at = models.DateTimeField(null=True, blank=True)
    billing_cycle_anchor_date = models.DateField(
        null=True,
        blank=True,
        help_text=(
            "First billable calendar day for late joiners (their first class session). "
            "Null keeps course.start_date as the invoice anchor."
        ),
    )

    objects = OpenUserCourseManager()
    including_ended = models.Manager()

    def get_role_from_assigned_as(self):
        role = ""
        if self.assigned_as == self.AssignedAs.TEACHER:
            role = "owners"
        else:
            role = "students"
        return role

    class Meta:
        base_manager_name = "including_ended"
        constraints = [
            UniqueConstraint(
                fields=["user", "course"],
                condition=Q(left_at__isnull=True),
                name="usercourse_one_open_per_user_course",
            )
        ]
        indexes = [
            models.Index(
                fields=["course", "assigned_as"],
                name="usercourse_open_course_role",
                condition=Q(left_at__isnull=True),
            ),
        ]


class CourseMembershipEvent(BaseModel):
    class EventType(models.TextChoices):
        JOINED = "joined", "Joined"
        REMOVED = "removed", "Removed"

    class Source(models.TextChoices):
        API = "api", "api"
        WEB_AI = "web_ai", "web_ai"
        TELEGRAM_BOT = "telegram_bot", "telegram_bot"
        IMPORT = "import", "import"
        CRON = "cron", "cron"

    course = models.ForeignKey(
        Course, on_delete=models.CASCADE, related_name="membership_events"
    )
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="course_membership_events"
    )
    event_type = models.CharField(max_length=16, choices=EventType.choices)
    occurred_at = models.DateTimeField()
    actor = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="membership_events_performed",
    )
    source = models.CharField(
        max_length=32,
        choices=Source.choices,
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ["-occurred_at", "-id"]
        indexes = [
            models.Index(fields=["course", "-occurred_at"]),
            models.Index(fields=["course", "user"]),
        ]


class Event(BaseModel):
    """
    An event represents a lecture or a lab session that happens within a Course.
    Overnight sessions are supported: when time_to <= time_from, the session ends on
    the next calendar day at time_to. Arbitrary multi-day spans are not supported.
    """

    title = models.CharField(max_length=512)
    date = models.DateTimeField()
    time_from = models.TimeField()
    time_to = models.TimeField()
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="events")
    is_substitution_reserve = models.BooleanField(
        default=False,
        help_text="Buffer day held for substitution; not counted toward max_sessions.",
    )

    class Meta:
        indexes = [
            models.Index(fields=["course", "date"], name="event_course_date_idx"),
            models.Index(fields=["date"], name="event_date_idx"),
        ]

    def save(self, *args, **kwargs):
        from app_course.session_time import validate_session_time_range

        validate_session_time_range(self.time_from, self.time_to)
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"<Event {self.id} {self.date} {self.time_from}:{self.time_to}>"


class DailyNote(BaseModel):
    """
    A note that can be attached to each of the course's events.
    """

    note = models.JSONField()
    event = models.OneToOneField(
        Event, on_delete=models.CASCADE, related_name="daily_note"
    )

    def __str__(self):
        return f"<DailyNote {self.id} {self.event}>"


class Assignment(BaseModel):
    title = models.CharField(max_length=512)
    instructions = models.JSONField()
    available_datetime = models.DateTimeField()
    due_datetime = models.DateTimeField()
    available_score = models.PositiveIntegerField()
    max_attempts = models.PositiveIntegerField(default=10)
    results_release_date = models.DateTimeField(null=True)

    course = models.ForeignKey(Course, on_delete=models.CASCADE)


class Submission(BaseModel):
    description = models.JSONField()
    user_score = models.PositiveIntegerField(null=True)
    feedback = models.TextField(null=True, blank=True)
    attempt_count = models.PositiveIntegerField(default=1)
    is_graded = models.BooleanField(default=False)
    are_results_released = models.BooleanField(default=False)

    assignment = models.ForeignKey(
        Assignment, on_delete=models.CASCADE, related_name="submissions"
    )
    created_by = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="submissions"
    )

    def save(self, *args, **kwargs):
        if self.user_score and self.user_score > self.assignment.available_score:
            raise ValidationError(
                {
                    "user_score": "User score cannot be greater than the assignment's available score."
                }
            )

        return super().save(*args, **kwargs)


class CourseHistory(BaseModel):
    class CompletionType(models.TextChoices):
        COMPLETED = "completed", "completed"
        DROPPED = "dropped", "dropped"
        FAILED = "failed", "failed"

    assigned_as = models.ForeignKey(AssignedAsRole, on_delete=models.PROTECT, null=True)
    completion_type = models.CharField(
        choices=CompletionType.choices, max_length=16, null=True
    )

    course = models.ForeignKey(
        Course, on_delete=models.CASCADE, related_name="course_histories", null=True
    )
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="course_histories", null=True
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="course_histories_created_by",
        null=True,
    )

    def save(self, *args, **kwargs):
        return super().save(*args, **kwargs)


class VideoAttendanceSource(models.TextChoices):
    MICROSOFT_TEAMS = "microsoft_teams", "Microsoft Teams"
    ZOOM = "zoom", "Zoom"


class UserAttendance(BaseModel):
    """
    Stores meeting check-in/checkout from video platforms (Teams, Zoom) attendance reports.
    Only populated for teachers (UserCourse.AssignedAs = 'teacher').
    Join/leave datetimes from the provider are the source of truth (not linked to Event).
    """

    class Meta:
        ordering = ("id",)

    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="user_attendances"
    )
    course = models.ForeignKey(
        Course, on_delete=models.CASCADE, related_name="user_attendances"
    )
    source = models.CharField(
        max_length=32,
        choices=VideoAttendanceSource.choices,
        default=VideoAttendanceSource.MICROSOFT_TEAMS,
        db_index=True,
    )
    join_datetime = models.DateTimeField()
    leave_datetime = models.DateTimeField()
    duration_seconds = models.PositiveIntegerField(default=0)
    hourly_rate_at_creation = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    attendance_date = models.DateField(
        null=True,
        blank=True,
        db_index=True,
        help_text="Date of join_datetime in the tenant's timezone. Use for payroll and reporting.",
    )


class ProcessedVideoAttendanceReport(BaseModel):
    """
    Tracks which video attendance report batches have been synced (Teams report id or Zoom fingerprint).
    """

    course = models.ForeignKey(
        Course, on_delete=models.CASCADE, related_name="processed_video_attendance_reports"
    )
    platform = models.CharField(
        max_length=32,
        choices=VideoAttendanceSource.choices,
        db_index=True,
    )
    external_report_id = models.CharField(max_length=512)

    class Meta:
        unique_together = ("course", "platform", "external_report_id")
        ordering = ("course", "platform", "external_report_id")


class ProcessedTeamsRecording(BaseModel):
    """
    Stores metadata for MS Teams meeting recordings. Recordings are copied from the
    organizer's OneDrive to a designated folder (see MEETING_RECORDINGS_SUBFOLDER).
    """

    course = models.ForeignKey(
        Course, on_delete=models.CASCADE, related_name="processed_recordings"
    )
    recording_id = models.CharField(max_length=1024)
    meeting_id = models.CharField(max_length=1024, blank=True)
    recording_content_url = models.CharField(
        max_length=2048,
        blank=True,
        help_text="Graph API URL to stream content (requires auth). Not a shareable link.",
    )
    created_datetime = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the recording was created (from Microsoft).",
    )
    file_path = models.CharField(
        max_length=1024,
        null=True,
        blank=True,
        help_text="Path where the recording was copied (within private media storage).",
    )
    onedrive_deleted = models.BooleanField(
        default=False,
        db_index=True,
        help_text="True when the original recording has been successfully deleted from OneDrive.",
    )

    class Meta:
        unique_together = ("course", "recording_id")
        ordering = ("course", "recording_id")


class UserUploadedRecording(BaseModel):
    """
    A recording manually uploaded by a staff member (teacher or above).
    The actual file is managed by juice-box and stored in app_attachment_attachment
    with table_name="app_course_useruploadedrecording" and foreign_key=<this record's id>.
    YouTube-backed recordings store link metadata instead of a file attachment.
    """

    class SourceType(models.TextChoices):
        FILE = "file", "file"
        YOUTUBE = "youtube", "youtube"

    course = models.ForeignKey(
        Course, on_delete=models.CASCADE, related_name="user_recordings"
    )
    recorded_date = models.DateField(
        help_text="The date when the class was recorded."
    )
    description = models.CharField(max_length=1024, blank=True)
    source_type = models.CharField(
        max_length=16,
        choices=SourceType.choices,
        default=SourceType.FILE,
    )
    youtube_url = models.URLField(max_length=2048, blank=True)
    youtube_video_id = models.CharField(max_length=32, blank=True)
    uploaded_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name="uploaded_recordings",
    )

    class Meta:
        ordering = ["course", "recorded_date", "created_at"]


class PaymentAssignment(BaseModel):
    """
    Tracks Microsoft Teams Education assignments created for monthly payment screenshot uploads.
    month_index = 1 for January, 2 for February, etc. (calendar month).
    One record per (course, year, month_index).
    """

    course = models.ForeignKey(
        Course, on_delete=models.CASCADE, related_name="payment_assignments"
    )
    year = models.PositiveIntegerField(help_text="Calendar year, e.g. 2025")
    month_index = models.PositiveIntegerField(
        help_text="Calendar month: 1=Jan, 2=Feb, ..., 12=Dec"
    )
    microsoft_assignment_id = models.CharField(max_length=512)

    class Meta:
        unique_together = ("course", "year", "month_index")
        ordering = ("course", "year", "month_index")


class CourseJoinRequest(BaseModel):
    class Status(models.TextChoices):
        PENDING = "pending", "pending"
        APPROVED = "approved", "approved"
        REJECTED = "rejected", "rejected"

    status = models.CharField(
        choices=Status.choices, default=Status.PENDING, max_length=16
    )
    reject_reason = models.CharField(max_length=1024, null=True, blank=True)
    course = models.ForeignKey(
        Course, on_delete=models.CASCADE, related_name="join_requests"
    )
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="course_join_requests"
    )

    class Meta:
        unique_together = ("course", "user")

        ordering = ("id",)
