import os

from datetime import time as time_cls

from django.contrib.postgres.fields import ArrayField
from django.core.exceptions import ValidationError
from django.db import models
from tenant_schemas.models import TenantMixin

from schedjuice_backend.storages import PrivateMediaStorage, PublicMediaStorage
from utilitas.models import BaseModel


def get_upload_to_path_for_logos(instance, filename):
    return os.path.join(instance.schema_name, "logos", filename)


def get_upload_to_path_for_certs(instance, filename):
    return os.path.join(instance.schema_name, "certificates", filename)


def get_upload_to_path_for_cover_image(instance, filename):
    return os.path.join(instance.schema_name, "default_cover_image", filename)


def get_upload_to_path_for_id_card_templates(instance, filename):
    schema = getattr(instance.organization, "schema_name", "public")
    return os.path.join(schema, "id_card_templates", filename)


def get_default_course_fields():
    """Legacy default for removed `course_fields`; kept for historical migrations."""
    from django.apps import apps

    Course = apps.get_model("app_course", "Course")
    exclude = {
        "subject",
        "exam_session_date",
        "exam_board",
        "program",
        "intake",
        "level",
        "section",
    }
    return [
        f.name
        for f in Course._meta.get_fields()
        if f.name not in exclude and not getattr(f, "auto_created", False)
    ]


class Organization(BaseModel, TenantMixin):
    is_public = models.BooleanField(default=False)

    name = models.CharField(max_length=4096, unique=True)
    logo = models.ImageField(upload_to=get_upload_to_path_for_logos, null=True, blank=True,
                             storage=PublicMediaStorage())
    tagline = models.CharField(
        max_length=200, null=True, blank=True, help_text="Some text under the title"
    )
    description = models.CharField(max_length=5000, null=True, blank=True)
    is_admin = models.BooleanField(default=False)
    is_demo = models.BooleanField(
        default=False,
        help_text="Demo/sandbox tenant provisioned by app_demo; exclude from billing.",
    )
    theme = models.JSONField(null=True, blank=True)

    available_domains = ArrayField(models.CharField(max_length=512))
    default_cover_image = models.ImageField(
        upload_to=get_upload_to_path_for_cover_image,
        null=True,
        blank=True,
        storage=PrivateMediaStorage(),
    )
    id_card_org_name = models.CharField(max_length=4096, null=True, blank=True)
    id_card_logo = models.ImageField(
        upload_to=get_upload_to_path_for_logos,
        null=True,
        blank=True,
        storage=PublicMediaStorage(),
    )
    id_card_staff_accent = models.CharField(max_length=9, default="#5ea37e")
    id_card_student_accent = models.CharField(max_length=9, default="#d97706")
    active_student_id_card_template = models.ForeignKey(
        "app_organization.IdCardTemplate",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    active_staff_id_card_template = models.ForeignKey(
        "app_organization.IdCardTemplate",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    # feature toggles
    is_homepage_disabled = models.BooleanField(default=False)
    is_student_login_disabled = models.BooleanField(default=False)
    is_library_disabled = models.BooleanField(default=True)
    can_teacher_create_course = models.BooleanField(default=False)
    teaching_subjects_allow_level_category_search = models.BooleanField(
        default=False,
        help_text=(
            "When on, teachers can add program levels and categories "
            "(not just subjects) to their teaching list."
        ),
    )
    notify_lead_observers_on_status_change = models.BooleanField(
        default=True,
        help_text="When True, email lead observers when a lead moves to a new status.",
    )
    notify_issue_observers_on_status_change = models.BooleanField(
        default=True,
        help_text="When True, email issue observers when an issue moves to a new status.",
    )
    is_student_teacher_group_chat_enabled = models.BooleanField(
        default=False,
        help_text=(
            "When True, auto-create private group chats between each student "
            "and their course teachers (MT/AT)."
        ),
    )
    is_students_dm_admins_only_enabled = models.BooleanField(
        default=False,
        help_text=(
            "When True, students may only start or send direct messages to "
            "school admins (superadmin, admin, manager)."
        ),
    )
    student_dm_contact_user_id = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text=(
            "Tenant User.id for the sole admin students may DM when "
            "is_students_dm_admins_only_enabled is True. No cross-schema FK."
        ),
    )
    is_mobile_id_card_enabled = models.BooleanField(
        default=False,
        help_text=(
            "When True, the mobile app digital ID page renders the "
            "organization's generated ID card instead of a plain QR code."
        ),
    )
    is_single_mobile_device_enabled = models.BooleanField(
        default=False,
        help_text=(
            "When True, each user may have at most one active native mobile "
            "app session; a new mobile login revokes other mobile sessions."
        ),
    )
    single_mobile_device_enabled_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When single mobile device policy was last enabled.",
    )
    # microsoft integration
    is_microsoft_on = models.BooleanField(default=False)
    is_teams_creation_enabled = models.BooleanField(
        default=True,
        help_text=(
            "When off, no MS Teams are created for courses even if Microsoft "
            "integration is on."
        ),
    )
    is_teams_attendance_sync_enabled = models.BooleanField(
        default=False,
        help_text=(
            "When on, the nightly sync-meeting-attendance cron fetches Microsoft "
            "Teams attendance reports into UserAttendance. Zoom sync is unaffected."
        ),
    )

    class VideoConferencingPlatform(models.TextChoices):
        MICROSOFT_TEAMS = "microsoft_teams", "Microsoft Teams"
        ZOOM = "zoom", "Zoom"
        GOOGLE_MEET = "google_meet", "Google Meet"

    video_conferencing_platform = models.CharField(
        max_length=32,
        choices=VideoConferencingPlatform.choices,
        null=True,
        blank=True,
        default=None,
        help_text="Primary video platform for the school. Null = not set (legacy: infer from Microsoft integration).",
    )
    authority = models.CharField(
        max_length=512,
        null=True,
        blank=True,
        help_text="https://login.microsoftonline.com/domain.onmicrosoft.com",
    )
    app_id = models.CharField(
        max_length=512, null=True, blank=True, help_text="Some long guid"
    )
    thumbprint = models.CharField(
        max_length=512, null=True, blank=True, help_text="Certificate thumbprint"
    )
    certificate_id = models.CharField(
        max_length=512, null=True, blank=True, help_text="Certificate's guid"
    )
    private_key = models.FileField(
        upload_to=get_upload_to_path_for_certs,
        null=True,
        help_text="Private key to encrypt data sent to Microsoft",
        storage=PrivateMediaStorage(),
    )
    client_secret = models.CharField(max_length=512, null=True, blank=True)
    tenant_id = models.CharField(
        max_length=512, null=True, blank=True, help_text="Tenant's guid"
    )
    staff_license_id = models.CharField(max_length=512, null=True, blank=True)
    student_license_id = models.CharField(max_length=512, null=True, blank=True)
    default_owner_id = models.CharField(
        max_length=512,
        null=True,
        blank=True,
        help_text="Azure AD user object ID of the meeting organizer (Entra > Users > [user] > Object ID). "
        "Must NOT be the Application (client) ID from app registration.",
    )
    delegated_account_upn = models.CharField(
        max_length=512,
        null=True,
        blank=True,
        help_text="Entra sign-in UPN for delegated Graph (password-grant) flows. "
        "Falls back to STAFFY_DELEGATED_UPN env when blank.",
    )
    delegated_account_password = models.CharField(
        max_length=512,
        null=True,
        blank=True,
        help_text="Password for delegated_account_upn. Falls back to STAFFY_PASSWORD env when blank.",
    )
    delegated_account_object_id = models.CharField(
        max_length=512,
        null=True,
        blank=True,
        help_text="Entra object ID of delegated_account_upn. "
        "Used for /users/{id}/ paths in delegated meeting flows. "
        "Falls back to STAFFY_AZURE_OBJECT_ID env when blank.",
    )
    meeting_sensitivity_label_id = models.CharField(
        max_length=512,
        null=True,
        blank=True,
        help_text="Sensitivity label ID that restricts recording access to organizers and co-organizers. "
        "Create in Microsoft Purview with 'Who has access to recording' = Organizers and co-organizers. "
        "Requires Teams Premium.",
    )

    # telegram integration
    is_telegram_on = models.BooleanField(default=False)
    is_telegram_login_on = models.BooleanField(
        default=False,
        help_text="Allow sign-in via Telegram Login Widget (requires configured bot).",
    )
    is_telegram_roster_sync_enabled = models.BooleanField(
        default=True,
        help_text="When off, no teacher membership sync; bot still posts announcements/DMs.",
    )
    telegram_bot_token_ct = models.TextField(
        null=True,
        blank=True,
        help_text="Fernet-encrypted bot token. Use set/get_telegram_bot_token().",
    )
    telegram_bot_username = models.CharField(max_length=64, null=True, blank=True)
    telegram_bot_id = models.CharField(max_length=64, null=True, blank=True)
    telegram_webhook_secret = models.CharField(max_length=128, null=True, blank=True)
    telegram_routing_key = models.CharField(
        max_length=64, unique=True, null=True, blank=True, db_index=True
    )

    # google integration
    is_google_on = models.BooleanField(default=False)
    is_google_login_on = models.BooleanField(
        default=False,
        help_text="Allow sign-in via Google (requires linked account).",
    )

    # consultation booking (LWTP v1)
    is_consultation_booking_on = models.BooleanField(
        default=False,
        help_text="Master switch for consultation booking.",
    )

    class ConsultationStrategy(models.TextChoices):
        LWTP = "lwtp", "lwtp"

    consultation_strategy = models.CharField(
        max_length=32,
        choices=ConsultationStrategy.choices,
        default=ConsultationStrategy.LWTP,
        help_text="Strategy preset when a consultant applies default whitelist.",
    )

    # AI assistant (tenant-wide)
    is_ai_enabled = models.BooleanField(default=True)
    ai_default_model = models.CharField(max_length=128, null=True, blank=True)
    ai_max_context_turns = models.PositiveSmallIntegerField(default=5)
    ai_max_tool_iterations = models.PositiveSmallIntegerField(default=5)
    ai_school_context = models.TextField(blank=True, default="")
    ai_assistant_instructions = models.TextField(blank=True, default="")
    ai_monthly_usd_limit = models.DecimalField(
        max_digits=12, decimal_places=4, null=True, blank=True
    )
    ai_monthly_token_limit = models.PositiveBigIntegerField(null=True, blank=True)
    ai_hard_enforce = models.BooleanField(default=False)
    ai_alert_thresholds = models.JSONField(default=list, blank=True)
    ai_budget_active = models.BooleanField(default=True)
    ai_default_user_monthly_usd_limit = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Default monthly USD cap per user. Null = platform default ($1).",
    )
    ai_enabled_packs = models.JSONField(
        default=list,
        blank=True,
        help_text="AI capability pack ids enabled for this org (core always on).",
    )

    def set_telegram_bot_token(self, raw: str | None) -> None:
        from app_telegram.crypto import encrypt_token

        self.telegram_bot_token_ct = encrypt_token(raw)

    def get_telegram_bot_token(self) -> str:
        from app_telegram.crypto import decrypt_token

        return decrypt_token(self.telegram_bot_token_ct)

    # Zoom Server-to-Server OAuth (Marketplace app) — used for meeting attendance report API.
    zoom_account_id = models.CharField(max_length=512, null=True, blank=True)
    zoom_client_id = models.CharField(max_length=512, null=True, blank=True)
    zoom_client_secret = models.CharField(max_length=512, null=True, blank=True)

    class ReportStyle(models.TextChoices):
        TR_SU_STYLE = "TR_SU_STYLE", "TR_SU_STYLE"
        TR_PHILLIPS_STYLE = "TR_PHILLIPS_STYLE", "TR_PHILLIPS_STYLE"
        EXCELLENT_CHOICE_STYLE = (
            "EXCELLENT_CHOICE_STYLE",
            "EXCELLENT_CHOICE_STYLE",
        )

    report_style = models.CharField(
        max_length=40,
        choices=ReportStyle.choices,
        null=True,
        blank=True
    )

    class PayrollCalculationStrategy(models.TextChoices):
        TR_PHILLIPS = "tr_phillips", "tr_phillips"
        SESSION_BASED = "session_based", "session_based"

    payroll_calculation_strategy = models.CharField(
        max_length=32,
        choices=PayrollCalculationStrategy.choices,
        default=PayrollCalculationStrategy.TR_PHILLIPS,
    )

    # library feature
    library_title = models.CharField(default="Library", max_length=512)

    is_building_checkin_enabled = models.BooleanField(default=False)

    class CampusCheckinVerificationMode(models.TextChoices):
        GEO_WITH_SELFIE_FALLBACK = (
            "geo_with_selfie_fallback",
            "geo_with_selfie_fallback",
        )
        GEO_ONLY = "geo_only", "geo_only"
        SELFIE_ONLY = "selfie_only", "selfie_only"

    use_student_attendance = models.BooleanField(
        default=True,
        help_text="Track student attendance status (present/late/absent) for data health.",
    )
    use_student_checkin = models.BooleanField(
        default=False,
        help_text="Track student manual session check-in. Mutually exclusive with use_student_attendance.",
    )
    use_teacher_session_checkin = models.BooleanField(
        default=True,
        help_text="Track teacher per-session check-in with photo.",
    )
    allow_teacher_checkin_history_correction = models.BooleanField(
        default=False,
        help_text=(
            "Allow teachers to correct or backfill their own session check-in/out "
            "times from course check-in history (requires reason; audit trail)."
        ),
    )
    allow_teacher_checkin_cancellation = models.BooleanField(
        default=False,
        help_text=(
            "Allow teachers to cancel an open session check-in when the student "
            "does not show up (requires reason; audit trail)."
        ),
    )
    course_data_health_session_lookback = models.PositiveIntegerField(
        default=5,
        help_text="Number of past sessions to evaluate for missing session data.",
    )
    campus_checkin_verification_mode = models.CharField(
        max_length=32,
        choices=CampusCheckinVerificationMode.choices,
        default=CampusCheckinVerificationMode.GEO_WITH_SELFIE_FALLBACK,
    )
    checkin_grace_period_minute = models.PositiveIntegerField(default=5)
    is_payroll_calculation_enabled = models.BooleanField(default=False)
    is_hr_fields_enabled = models.BooleanField(default=False)
    is_staff_points_enabled = models.BooleanField(
        default=False,
        help_text="When True, staff points ledger (multi-currency) is available.",
    )
    is_crm_enabled = models.BooleanField(
        default=False,
        help_text="When True, CRM (Leads and Issues) is visible in the app.",
    )
    supports_course_specific_rates = models.BooleanField(
        default=False,
        help_text="When True, use UserCourse.hourly_rate when set; otherwise fall back to User.per_hour_rate.",
    )
    can_teacher_see_self_earnings = models.BooleanField(default=False)

    class TransactionScreenshotStrategy(models.TextChoices):
        # schools like Tr.Phillips
        USER_UPLOAD = 'user_upload', 'user_upload'
        # schools like Tr. Su
        ADMIN_UPLOAD = 'admin_upload', 'admin_upload'

    transaction_screenshot_strategy = models.CharField(
        max_length=20,
        choices=TransactionScreenshotStrategy.choices,
        default=TransactionScreenshotStrategy.USER_UPLOAD,
    )

    class DefaultStudentPaymentPlan(models.TextChoices):
        SINGLE_MONTH = "single_month", "single_month"
        MULTIPLE_MONTHS = "multiple_months", "multiple_months"
        INSTALLMENT = "installment", "installment"

    default_student_payment_plan = models.CharField(
        max_length=20,
        choices=DefaultStudentPaymentPlan.choices,
        default=DefaultStudentPaymentPlan.SINGLE_MONTH,
        help_text="Preselected payment plan on the student payment upload form.",
    )

    is_fm_hm_course_display_enabled = models.BooleanField(
        default=False,
        help_text="When True, FM/HM (full-month vs half-month) filters can apply to payment and unpaid summaries.",
    )
    is_wd_we_course_types_enabled = models.BooleanField(
        default=False,
        help_text=(
            "When True, scheduling uses WD (Mon–Thu) and WE (Sat–Sun) course types "
            "instead of individual weekday labels."
        ),
    )
    is_payment_plan_mandatory = models.BooleanField(
        default=False,
        help_text=(
            "When True, courses must have a payment_plan. "
            "Use for schools that rely on discounts, installments, and invoicing."
        ),
    )
    is_exam_board_in_course_enabled = models.BooleanField(
        default=False,
        help_text=(
            "When True, show exam session and exam board on course forms "
            "and require them on create/update."
        ),
    )
    is_course_id_card_expiry_enabled = models.BooleanField(
        default=False,
        help_text=(
            "When True, courses may set an ID card expiry date that overrides "
            "the template expiry for enrolled students."
        ),
    )
    is_legacy_discount_visible = models.BooleanField(
        default=False,
        help_text=(
            "When True, show legacy PaymentPlan discount_price and "
            "per_hour_price fields in admin UI."
        ),
    )
    is_discount_eligibility_enabled = models.BooleanField(
        default=True,
        help_text=(
            "When False, discount eligibility rules are unused: UI hides them and "
            "create/update force eligibility_type to none."
        ),
    )
    auto_assign_creator_as_main_teacher = models.BooleanField(
        default=False,
        help_text=(
            "When True, if the course creator has exactly one role and it is teacher, "
            "assign them as MAIN_TEACHER on the course and all of its events."
        ),
    )
    is_course_role_enabled = models.BooleanField(
        default=True,
        help_text=(
            "When False, teacher assignments ignore course-role choice and force the "
            "tenant's MAIN_TEACHER AssignedAsRole. Errors if no MT role exists."
        ),
    )
    is_substitute_teachers_enabled = models.BooleanField(
        default=False,
        help_text=(
            "Allow course roles to be marked as substitute roles. Substitute assignments "
            "pick specific session dates and can auto-expire after the last one."
        ),
    )
    warn_on_long_course_duration = models.BooleanField(
        default=False,
        help_text=(
            "When True, show a warning on course create when the date range spans "
            "more than 30 calendar days."
        ),
    )

    class CourseSheetTemplate(models.TextChoices):
        TEACHER_SU = "teacher_su", "Teacher Su"

    course_sheet_template = models.CharField(
        max_length=32,
        choices=CourseSheetTemplate.choices,
        null=True,
        blank=True,
        default=None,
        help_text="Layout template for the Course Data sheet shortcut. Null hides the shortcut.",
    )

    class InvoiceGenerationStrategy(models.TextChoices):
        TR_PHILLIPS_STYLE = 'tr_phillips_style', 'tr_phillips_style'

    # how invoices are issued to students
    invoice_generation_strategy = models.CharField(
        max_length=100,
        choices=InvoiceGenerationStrategy.choices,
        default=None,
        null=True,
    )
    invoice_generation_interval_days = models.PositiveIntegerField(default=30)

    alumni_grace_period_day = models.PositiveIntegerField(null=True, blank=True)
    cost_per_account_per_day = models.PositiveIntegerField(null=True, blank=True)
    platform_monthly_flat_rate = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text=(
            "Optional monthly platform flat fee in tenant currency. "
            "Included on platform invoices when set."
        ),
    )



    # timezone setting (e.g Asia/Rangoon, Asia/Bangkok)
    timezone = models.CharField(
        max_length=64,
        default="Asia/Rangoon",
    )

    class TimeDisplayFormat(models.TextChoices):
        TWELVE_H = "12h", "12-hour"
        TWENTY_FOUR_H = "24h", "24-hour"

    time_display_format = models.CharField(
        max_length=3,
        choices=TimeDisplayFormat.choices,
        default=TimeDisplayFormat.TWELVE_H,
        help_text="How times are shown in the app UI (pickers and labels).",
    )

    default_session_start_time = models.TimeField(
        default=time_cls(19, 0),
        help_text="Default class session start time for simple scheduling UI.",
    )
    default_session_duration_minutes = models.PositiveIntegerField(
        default=90,
        help_text="Default class session duration in minutes for simple scheduling UI.",
    )

    currency_fullname = models.CharField(max_length=100, default="Myanmar Kyat")
    currency_symbol = models.CharField(max_length=10, default="Ks")
    currency_iso4217 = models.CharField(max_length=10, default="MMK")

    max_custom_field_definitions_per_entity = models.PositiveIntegerField(
        default=100,
        help_text="Max active custom field definitions per entity type (e.g. User) in this tenant.",
    )

    def clean(self):
        super().clean()
        if self.use_student_attendance and self.use_student_checkin:
            raise ValidationError(
                "Student attendance marking and student check-in cannot both be enabled."
            )

    def zoom_s2s_configured(self) -> bool:
        """Deprecated. Single S2S credentials are no longer used. Always False.

        Replaced by the multi-account ``ZoomAccount`` model + admin OAuth flow;
        callers should prefer ``has_active_zoom_account()``. Kept on the model
        only so any straggling references degrade safely to the disabled state.
        """
        return False

    def has_active_zoom_account(self) -> bool:
        return self.zoom_accounts.filter(
            status=ZoomAccount.Status.ACTIVE
        ).exists()

    def __str__(self):
        return f"<Organization {self.domain_url}: {self.id}>"


def default_id_card_background_transform():
    fill = {"offsetX": 0, "offsetY": 0, "scale": 1}
    return {"front": dict(fill), "back": dict(fill)}


class IdCardTemplate(BaseModel):
    """Uploaded ID card artwork + slot layout for one audience (student or staff)."""

    class Audience(models.TextChoices):
        STUDENT = "student", "Student"
        STAFF = "staff", "Staff"

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="id_card_templates",
    )
    name = models.CharField(max_length=256)
    audience = models.CharField(max_length=16, choices=Audience.choices)
    width_in = models.DecimalField(max_digits=6, decimal_places=3)
    height_in = models.DecimalField(max_digits=6, decimal_places=3)
    background = models.ImageField(
        upload_to=get_upload_to_path_for_id_card_templates,
        storage=PublicMediaStorage(),
    )
    slots = models.JSONField(default=list, blank=True)
    back_background = models.ImageField(
        upload_to=get_upload_to_path_for_id_card_templates,
        storage=PublicMediaStorage(),
        null=True,
        blank=True,
    )
    back_slots = models.JSONField(default=list, blank=True)
    background_transform = models.JSONField(
        default=default_id_card_background_transform,
        blank=True,
    )
    academic_year = models.CharField(max_length=64, null=True, blank=True)
    expires_on = models.DateField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "name", "audience"],
                name="uniq_id_card_template_org_name_audience",
            ),
        ]

    def clean(self):
        if self.width_in is not None and self.width_in <= 0:
            raise ValidationError({"width_in": "Width must be positive."})
        if self.height_in is not None and self.height_in <= 0:
            raise ValidationError({"height_in": "Height must be positive."})

    def __str__(self):
        return f"<IdCardTemplate:{self.id} {self.name} ({self.audience})>"


class ZoomAccount(BaseModel):
    """A Zoom account connected to an Organization via admin OAuth.

    Lives in the public schema (alongside ``Organization``). One organization
    can connect multiple Zoom accounts; each one stores its own refresh token
    and a chosen default host. ``Course.zoom_account_id`` is a string lookup
    against ``ZoomAccount.account_id`` for the same organization (cross-schema
    FKs are awkward in tenant_schemas, so we key by the external Zoom id).
    """

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        NEEDS_RECONNECT = "needs_reconnect", "Needs reconnect"
        DISCONNECTED = "disconnected", "Disconnected"

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="zoom_accounts",
    )
    account_id = models.CharField(
        max_length=128,
        help_text="External Zoom account_id returned by /v2/users/me on connect.",
    )
    account_name = models.CharField(max_length=256, blank=True, default="")

    authorized_by_zoom_user_id = models.CharField(
        max_length=128, blank=True, default="",
        help_text="Zoom user_id of the admin who installed the app for this account.",
    )
    authorized_by_email = models.CharField(
        max_length=320, blank=True, default="",
        help_text="Email of the admin who installed the app (display only).",
    )

    access_token_ct = models.TextField(blank=True, default="")
    refresh_token_ct = models.TextField(blank=True, default="")
    expires_at = models.DateTimeField(null=True, blank=True)

    default_host_zoom_user_id = models.CharField(
        max_length=128, blank=True, default="",
        help_text="Zoom user_id under which course meetings are scheduled.",
    )
    default_host_email = models.CharField(max_length=320, blank=True, default="")
    default_host_name = models.CharField(max_length=256, blank=True, default="")

    status = models.CharField(
        max_length=32,
        choices=Status.choices,
        default=Status.ACTIVE,
    )
    last_validated_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True, default="")

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "account_id"],
                name="uniq_zoom_account_org_account_id",
            )
        ]
        indexes = [
            models.Index(fields=["organization", "status"], name="ix_zoom_account_org_status"),
        ]

    def __str__(self):
        return f"<ZoomAccount {self.organization_id}:{self.account_id}>"

    @property
    def access_token(self) -> str:
        from app_zoom.crypto import decrypt_token
        return decrypt_token(self.access_token_ct)

    @property
    def refresh_token(self) -> str:
        from app_zoom.crypto import decrypt_token
        return decrypt_token(self.refresh_token_ct)

    def set_tokens(
        self,
        *,
        access_token: str | None = None,
        refresh_token: str | None = None,
        expires_at=None,
    ) -> None:
        """Persist tokens encrypted; fields not passed are left untouched."""
        from app_zoom.crypto import encrypt_token

        update_fields: list[str] = []
        if access_token is not None:
            self.access_token_ct = encrypt_token(access_token)
            update_fields.append("access_token_ct")
        if refresh_token is not None:
            self.refresh_token_ct = encrypt_token(refresh_token)
            update_fields.append("refresh_token_ct")
        if expires_at is not None:
            self.expires_at = expires_at
            update_fields.append("expires_at")
        if not update_fields:
            return
        update_fields.append("updated_at")
        self.save(update_fields=update_fields)

    def has_default_host(self) -> bool:
        return bool((self.default_host_zoom_user_id or "").strip())


class MicrosoftDelegatedAccount(BaseModel):
    """Org-level Microsoft delegated OAuth for the service account (public schema).

    Used for org-wide Teams broadcasts, channel listing, meeting-link posts, and
    as fallback when a teacher has not connected personal Microsoft OAuth.
    """

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        NEEDS_RECONNECT = "needs_reconnect", "Needs reconnect"
        DISCONNECTED = "disconnected", "Disconnected"

    organization = models.OneToOneField(
        Organization,
        on_delete=models.CASCADE,
        related_name="microsoft_delegated_account",
    )
    authorized_upn = models.CharField(max_length=320, blank=True, default="")
    authorized_object_id = models.CharField(max_length=128, blank=True, default="")
    msal_cache_ct = models.TextField(blank=True, default="")
    expires_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=32,
        choices=Status.choices,
        default=Status.ACTIVE,
    )
    last_error = models.TextField(blank=True, default="")

    class Meta:
        db_table = "app_organization_microsoftdelegatedaccount"

    def __str__(self):
        return f"<MicrosoftDelegatedAccount org={self.organization_id}>"

    def set_msal_cache(self, cache_blob: str, *, expires_at=None) -> None:
        from app_microsoft.crypto import encrypt_msal_cache

        self.msal_cache_ct = encrypt_msal_cache(cache_blob)
        update_fields = ["msal_cache_ct", "updated_at"]
        if expires_at is not None:
            self.expires_at = expires_at
            update_fields.append("expires_at")
        self.save(update_fields=update_fields)

    def get_msal_cache_blob(self) -> str:
        from app_microsoft.crypto import decrypt_msal_cache

        return decrypt_msal_cache(self.msal_cache_ct)


class PlatformOpsSettings(BaseModel):
    discord_webhook_url_ct = models.TextField(blank=True, default="")
    discord_webhook_updated_at = models.DateTimeField(null=True, blank=True)
    github_docs_video_token_ct = models.TextField(blank=True, default="")
    github_docs_video_repo = models.CharField(max_length=256, blank=True, default="")
    github_docs_video_release_tag = models.CharField(
        max_length=128, blank=True, default="videos"
    )
    github_docs_video_settings_updated_at = models.DateTimeField(null=True, blank=True)

    @classmethod
    def get_singleton(cls) -> "PlatformOpsSettings":
        from tenant_schemas.utils import get_public_schema_name, schema_context

        with schema_context(get_public_schema_name()):
            obj, _ = cls.objects.get_or_create(pk=1)
            return obj

    def set_discord_webhook_url(self, raw: str | None) -> None:
        from django.utils import timezone

        from app_organization.platform_secrets import encrypt_platform_secret

        self.discord_webhook_url_ct = encrypt_platform_secret((raw or "").strip())
        self.discord_webhook_updated_at = timezone.now()

    def get_discord_webhook_url(self) -> str:
        from app_organization.platform_secrets import decrypt_platform_secret

        if not self.discord_webhook_url_ct:
            return ""
        return decrypt_platform_secret(self.discord_webhook_url_ct)

    def set_github_docs_video_token(self, raw: str | None) -> None:
        from django.utils import timezone

        from app_organization.platform_secrets import encrypt_platform_secret

        self.github_docs_video_token_ct = encrypt_platform_secret((raw or "").strip())
        self.github_docs_video_settings_updated_at = timezone.now()

    def get_github_docs_video_token(self) -> str:
        from app_organization.platform_secrets import decrypt_platform_secret

        if not self.github_docs_video_token_ct:
            return ""
        return decrypt_platform_secret(self.github_docs_video_token_ct)


class GoogleCalendarPushChannel(BaseModel):
    """Public-schema registry mapping Google push channel ids to tenant consultants."""

    channel_id = models.CharField(max_length=64, unique=True)
    resource_id = models.CharField(max_length=256)
    tenant_schema = models.CharField(max_length=63)
    consultant_user_id = models.BigIntegerField()
    expiration = models.DateTimeField()
    sync_token = models.TextField(blank=True, default="")

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tenant_schema", "consultant_user_id"],
                name="uniq_google_calendar_push_channel_consultant",
            ),
        ]


class CronHealthAlert(BaseModel):
    schema_name = models.CharField(max_length=63)
    log_command_name = models.CharField(max_length=256)
    alert_type = models.CharField(max_length=32)
    last_alerted_at = models.DateTimeField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["schema_name", "log_command_name", "alert_type"],
                name="uniq_cron_health_alert",
            ),
        ]


class PlatformInvoiceCounter(BaseModel):
    """Singleton in public schema: next platform invoice # to allocate (pk=1 only)."""

    next_sequence = models.PositiveIntegerField(default=1)


class PlatformInvoice(BaseModel):
    class Status(models.TextChoices):
        ISSUED = "issued", "issued"
        VOID = "void", "void"

    organization = models.ForeignKey(
        "app_organization.Organization",
        on_delete=models.CASCADE,
        related_name="platform_invoices",
    )
    invoice_number = models.PositiveIntegerField(unique=True)
    billing_year = models.PositiveSmallIntegerField()
    billing_month = models.PositiveSmallIntegerField()
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.ISSUED,
    )
    line_items = models.JSONField(default=list)
    totals = models.JSONField(default=dict)
    generated_by_user_id = models.PositiveIntegerField(null=True, blank=True)
    generated_by_name = models.CharField(max_length=4096, blank=True, default="")
    generated_by_email = models.CharField(max_length=512, blank=True, default="")
    generated_at = models.DateTimeField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "billing_year", "billing_month"],
                name="uniq_platform_invoice_org_period",
            ),
        ]
        ordering = ["-generated_at", "-id"]


class MobileAppVersionPolicy(BaseModel):
    class AppVariant(models.TextChoices):
        SCHEDJUICE = "schedjuice", "Schedjuice"
        TEACHERSUCENTER = "teachersucenter", "TeacherSuCenter"
        SDEC = "sdec", "SDEC"

    class Platform(models.TextChoices):
        IOS = "ios", "iOS"
        ANDROID = "android", "Android"

    variant = models.CharField(max_length=32, choices=AppVariant.choices)
    platform = models.CharField(max_length=16, choices=Platform.choices)
    minimum_version = models.CharField(max_length=32)
    recommended_version = models.CharField(max_length=32, blank=True, default="")
    latest_version = models.CharField(max_length=32)
    store_url = models.URLField(max_length=512, blank=True, default="")
    message = models.TextField(blank=True, default="")
    is_enabled = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["variant", "platform"],
                name="uniq_mobile_app_version_policy",
            ),
        ]
        ordering = ["variant", "platform"]
