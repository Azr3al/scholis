import uuid

from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.contrib.postgres.indexes import GinIndex
from django.contrib.postgres.search import SearchVectorField
from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.db.models import BooleanField, ExpressionWrapper
from django.db.models.expressions import RawSQL
from django.utils import timezone

from app_custom_fields.models import CustomDataMixin
from app_auth.managers import CustomUserManager
from app_microsoft.mail import send_mail
from app_tasks.models import Task
from schedjuice_backend.helpers import get_tenant_specific_upload_folder
from schedjuice_backend.storages import PrivateMediaStorage
from utilitas.models import BaseModel, PostgresGeneratedColumnMixin
from decouple import config


def get_tenant_specific_upload_folder_for_profile(instance, filename):
    return get_tenant_specific_upload_folder(filename, "profile_images")


def get_tenant_specific_upload_folder_for_cover(instance, filename):
    return get_tenant_specific_upload_folder(filename, "cover_images")


def get_tenant_specific_upload_folder_for_id_photo(instance, filename):
    return get_tenant_specific_upload_folder(filename, "id_photos")


def get_tenant_specific_upload_folder_for_user_signature(instance, filename):
    return get_tenant_specific_upload_folder(filename, "user_signatures")


def get_tenant_specific_upload_folder_for_user_images(instance, filename):
    return get_tenant_specific_upload_folder(filename, "user_images")


class User(
    AbstractBaseUser,
    CustomDataMixin,
    PostgresGeneratedColumnMixin,
    BaseModel,
    PermissionsMixin,
):
    """
    The user model
    """

    postgres_generated_column_attnames = (
        "phone_number_digits",
        "emergency_contact_phone_number_digits",
        "search_vector",
    )

    class UserRole(models.TextChoices):
        SUPERADMIN = "superadmin", "superadmin"

        ADMIN = "admin", "admin"
        MANAGER = "manager", "manager"
        TEACHER = "teacher", "teacher"
        FINANCE = "finance", "finance"
        HR = "hr", "hr"
        CONSULTANT = "consultant", "consultant"

        STUDENT = "student", "student"

    class Gender(models.TextChoices):
        MALE = "MALE", "male"
        FEMALE = "FEMALE", "female"
        NON_BINARY = "NON_BINARY", "non_binary"
        OTHER = "OTHER", "other"

    class BloodType(models.TextChoices):
        A_POS = "A+", "A+"
        A_NEG = "A-", "A-"
        B_POS = "B+", "B+"
        B_NEG = "B-", "B-"
        AB_POS = "AB+", "AB+"
        AB_NEG = "AB-", "AB-"
        O_POS = "O+", "O+"
        O_NEG = "O-", "O-"

    class ViewMode(models.TextChoices):
        TABLE = "table", "table"
        CARD = "card", "card"

    email = models.EmailField(unique=True)
    phone_number = models.CharField(max_length=512)
    communication_email = models.EmailField()

    name = models.CharField(max_length=512)
    profile_image = models.ImageField(
        upload_to=get_tenant_specific_upload_folder_for_profile,
        null=True,
        blank=True,
        storage=PrivateMediaStorage(),
    )
    cover_image = models.ImageField(
        upload_to=get_tenant_specific_upload_folder_for_cover,
        null=True,
        blank=True,
        storage=PrivateMediaStorage(),
    )
    id_photo = models.ImageField(
        upload_to=get_tenant_specific_upload_folder_for_id_photo,
        null=True,
        blank=True,
        storage=PrivateMediaStorage(),
    )
    id_photo_thumb = models.ImageField(
        upload_to=get_tenant_specific_upload_folder_for_id_photo,
        null=True,
        blank=True,
        storage=PrivateMediaStorage(),
    )
    user_signature = models.ImageField(
        upload_to=get_tenant_specific_upload_folder_for_user_signature,
        null=True,
        blank=True,
        storage=PrivateMediaStorage(),
    )
    house_number = models.CharField(max_length=512, null=True, blank=True)
    street = models.CharField(max_length=512, null=True, blank=True)
    township = models.CharField(max_length=512, null=True, blank=True)
    city = models.CharField(max_length=512, null=True, blank=True)
    region = models.CharField(max_length=512, null=True, blank=True)
    country = models.CharField(max_length=512, null=True, blank=True)

    nrc_passport = models.CharField(max_length=512, null=True, blank=True)
    delivery_address = models.TextField(null=True, blank=True)

    alternative_name = models.CharField(max_length=512, null=True, blank=True)
    description = models.CharField(max_length=512, null=True, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(choices=Gender.choices, max_length=32, null=True)
    code = models.CharField(max_length=512, null=True, blank=False, unique=True)

    facebook_account_link = models.CharField(max_length=512, null=True, blank=True)

    visibility = models.ForeignKey(
        "app_auth.Visibility",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="users",
    )

    default_view_mode = models.CharField(
        max_length=64, choices=ViewMode.choices, default=ViewMode.CARD
    )
    is_password_change_required = models.BooleanField(default=True)
    is_biometric_enabled = models.BooleanField(default=False)

    emergency_contact_name = models.CharField(max_length=512, null=True, blank=True)
    emergency_contact_phone_number = models.CharField(max_length=512, null=True, blank=True)
    emergency_contact_relationship = models.CharField(max_length=256, null=True, blank=True)
    blood_type = models.CharField(
        max_length=8,
        choices=BloodType.choices,
        null=True,
        blank=True,
    )
    id_card_class_name = models.CharField(max_length=512, null=True, blank=True)

    # DB-maintained generated columns (see migration 0046); read-only in the ORM.
    # Must not set default= — Django would include the column on INSERT and Postgres rejects writes.
    phone_number_digits = models.TextField(editable=False, null=True, blank=True)
    emergency_contact_phone_number_digits = models.TextField(
        editable=False, null=True, blank=True
    )

    search_text = models.TextField(blank=True, default="")
    search_vector = SearchVectorField(editable=False, null=True)

    microsoft_id = models.CharField(max_length=512, null=True, blank=True)
    microsoft_display_name = models.CharField(max_length=256, blank=True, default="")
    google_id = models.CharField(max_length=255, null=True, blank=True, db_index=True)
    google_linked_at = models.DateTimeField(null=True, blank=True)
    microsoft_license_assigned = models.BooleanField(default=True)
    telegram_user_id = models.BigIntegerField(null=True, blank=True, db_index=True)
    telegram_chat_id = models.BigIntegerField(null=True, blank=True)
    telegram_username = models.CharField(max_length=64, null=True, blank=True)
    telegram_linked_at = models.DateTimeField(null=True, blank=True)
    zoom_user_identifier = models.CharField(
        max_length=512,
        null=True,
        blank=True,
        help_text="Stable Zoom identity for attendance matching: participant user_email, user_id, or id from report API.",
    )

    is_active = models.BooleanField(default=True)
    is_waiting_for_activation = models.BooleanField(default=False)
    is_staff = models.BooleanField(default=False)

    grace_period_start = models.DateTimeField(null=True, blank=True)

    # Denormalized profile completeness (0-100), recomputed on save and by the
    # recompute_profile_completeness command. Drives the completion banner/worklist.
    profile_completeness = models.PositiveSmallIntegerField(default=0)

    class EmploymentType(models.TextChoices):
        PART_TIME = "part_time", "part_time"
        FULL_TIME = "full_time", "full_time"

    class TypeOfPay(models.TextChoices):
        PER_MONTH = "per_month", "Per Month"
        PER_SESSION = "per_session", "Per Session"
        COLLABORATION = "collaboration", "Collaboration Half/Half"

    contract_expiry_date = models.DateField(null=True, blank=True)
    probation_end_date = models.DateField(null=True, blank=True)
    employment_start_date = models.DateField(null=True, blank=True)
    employment_type = models.CharField(max_length=32, choices=EmploymentType.choices, null=True, blank=True)

    resigned_at = models.DateTimeField(null=True, blank=True)
    resignation_inform_date = models.DateField(null=True, blank=True)
    resignation_last_working_date = models.DateField(null=True, blank=True)
    resignation_type_of_pay = models.CharField(
        max_length=32, choices=TypeOfPay.choices, null=True, blank=True
    )
    resignation_employment_type = models.CharField(
        max_length=32, choices=EmploymentType.choices, null=True, blank=True
    )
    resignation_remark = models.TextField(null=True, blank=True)

    preferred_checkin_time = models.DateTimeField(null=True, blank=True)
    preferred_checkout_time = models.DateTimeField(null=True, blank=True)
    access_log_name = models.CharField(max_length=256, null=True, blank=True)

    working_hour_per_month = models.PositiveIntegerField(null=True, blank=True)
    salary = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    per_session_rate = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    per_hour_rate = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    student_bonus_hourly_rate = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    course_rates = models.JSONField(
        null=True,
        blank=True,
        help_text="Category-specific rates: { category_id: rate }. Used to auto-set UserCourse.hourly_rate on create.",
    )

    qualifications = models.JSONField(
        null=True,
        blank=True,
    )
    is_public_profile_enabled = models.BooleanField(default=False)
    public_profile_slug = models.CharField(
        max_length=16,
        null=True,
        blank=True,
        unique=True,
    )
    consultation_booking_slug = models.CharField(
        max_length=16,
        null=True,
        blank=True,
        unique=True,
    )
    id_verify_code = models.CharField(
        max_length=12,
        null=True,
        blank=True,
        unique=True,
    )
    show_certifications_on_public_profile = models.BooleanField(default=False)

    roles = ArrayField(models.CharField(max_length=128))
    scoped_programs = models.ManyToManyField(
        "app_course.Program",
        blank=True,
        related_name="scoped_users",
    )
    scoped_categories = models.ManyToManyField(
        "app_course.Category",
        blank=True,
        related_name="scoped_users",
    )
    # organization = models.ForeignKey(
    #     "app_organization.Organization", on_delete=models.CASCADE
    # )

    groups = None
    user_permissions = None

    USERNAME_FIELD = "email"
    objects = CustomUserManager()

    def delete(self, using=None, keep_parents=False, *args, **kwargs):
        if self.microsoft_id:
            task = Task(name=Task.TaskName.DELETE_USER, data={"id": self.microsoft_id})
            task.save()
        return super().delete(using=using, keep_parents=keep_parents)

    def save(self, *args, **kwargs):
        if self._state.adding and self.code in (None, ""):
            from app_auth.user_code import assign_code_if_blank

            assign_code_if_blank(self)
        super().save(*args, **kwargs)

    def is_student(self):
        return len(self.roles) == 1 and self.UserRole.STUDENT in self.roles

    def is_admin(self):
        return (
                self.UserRole.ADMIN in self.roles
                or self.UserRole.MANAGER in self.roles
                or self.UserRole.SUPERADMIN in self.roles
        )

    def is_teacher(self):
        return self.UserRole.TEACHER in self.roles

    def get_sorted_roles(self):
        sorted_roles = [
            User.UserRole.SUPERADMIN,
            User.UserRole.ADMIN,
            User.UserRole.MANAGER,
            User.UserRole.FINANCE,
            User.UserRole.HR,
            User.UserRole.CONSULTANT,
            User.UserRole.TEACHER,
            User.UserRole.STUDENT,
        ]

        def sort_key(slug):
            try:
                return sorted_roles.index(slug)
            except ValueError:
                return len(sorted_roles)

        return sorted(self.roles, key=sort_key)

    def get_effective_permissions(self):
        from app_rbac.resolution import resolve_for_roles
        return sorted(resolve_for_roles(self.roles or []))

    @classmethod
    def get_user_from_request(cls, request):
        """Resolve the authenticated `User` row for `request`, memoized per request.

        This is called very frequently per-request across the codebase —
        including once per serialized item in some list views (e.g.
        `BaseChatMessageSerializer.get_reactions` for every message in a
        response). Without caching, N serialized items means N identical
        `User` lookups for the same request. `request` is the same object
        throughout a single request/response cycle and its authenticated
        user never changes mid-request, so caching on the request instance
        is safe.
        """
        cached = getattr(request, "_schedjuice_cached_user", None)
        if cached is not None:
            return cached
        user = User.objects.filter(email=request.user.id).first()
        if user is not None:
            request._schedjuice_cached_user = user
        return user

    def __str__(self):
        return f"<User: {self.id} {self.email}>"

    def send_password_reset_token_email(self, tenant, token: str):
        link = f"https://{tenant.domain_url}/reset-password?token={token}"

        if config("IS_DEV", default=False, cast=bool):
            link = f"http://localhost:3000/reset-password?token={token}"

        from app_microsoft.email_templates import build_subject, render_email, tenant_label

        org_name = tenant_label(tenant) or "your organization"
        subject = build_subject(tenant, "Password reset")
        body_string = render_email(
            tenant=tenant,
            recipient_name=self.name,
            heading=f"Reset your password for {org_name}",
            intro_html="Use the button below to choose a new password. This link expires soon.",
            cta_label="Reset password",
            cta_url=link,
            preheader="Reset your password using the secure link inside.",
        )
        send_mail(tenant, subject, body_string, self.email)

    def send_password_reset_email_notification(self, tenant):
        from app_microsoft.email_templates import build_subject, render_email, tenant_label

        org_name = tenant_label(tenant) or "your organization"
        subject = build_subject(tenant, "Password changed")
        body_string = render_email(
            tenant=tenant,
            recipient_name=self.name,
            heading=f"Your {org_name} password was changed",
            intro_html="This is to confirm that your password has been reset.",
            security_note=(
                "If you did not request this change, contact your administrator immediately."
            ),
            preheader="Your password was changed.",
        )
        send_mail(tenant, subject, body_string, self.email)

    def send_dvr_notification_email(self, tenant, dvr):
        from app_microsoft.email_templates import build_subject, render_email, tenant_label

        org_name = tenant_label(tenant) or "your organization"
        link = f"https://{tenant.domain_url}/data-verification-requests/{dvr.id}/verify"
        subject = build_subject(tenant, "Data verification")
        body_string = render_email(
            tenant=tenant,
            recipient_name=self.name,
            heading=f"Data verification request from {org_name}",
            intro_html="A data verification request has been created for you.",
            cta_label="Review request",
            cta_url=link,
            preheader="Please review your data verification request.",
        )
        send_mail(tenant, subject, body_string, self.email)

    class Meta:
        ordering = ("id",)
        indexes = [
            GinIndex(
                fields=["custom_data"],
                name="auth_user_custom_data_gin",
                opclasses=["jsonb_path_ops"],
            ),
        ]
        constraints = [
            models.CheckConstraint(
                check=ExpressionWrapper(
                    RawSQL("jsonb_typeof(custom_data) = 'object'", []),
                    output_field=BooleanField(),
                ),
                name="app_auth_user_custom_data_is_object",
            ),
        ]


class UserCertification(BaseModel):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="certifications",
    )
    title = models.CharField(max_length=256)
    issuing_organization = models.CharField(max_length=256)
    issued_on = models.DateField()
    expires_on = models.DateField(null=True, blank=True)
    attachment = models.ForeignKey(
        "app_attachment.Attachment",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="user_certifications",
    )
    sort_order = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="created_certifications",
    )

    class Meta:
        ordering = ["sort_order", "created_at"]

    def __str__(self):
        return f"<UserCertification:{self.id} {self.title}>"


class UserImage(BaseModel):
    class ImageType(models.TextChoices):
        AWARD_IMAGE = "award_image", "Award image"
        ID_IMAGE = "id_image", "ID image"

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="user_images",
    )
    image_type = models.CharField(max_length=32, choices=ImageType.choices)
    image = models.ImageField(
        upload_to=get_tenant_specific_upload_folder_for_user_images,
        storage=PrivateMediaStorage(),
    )
    uploaded_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="uploaded_user_images",
    )

    class Meta:
        indexes = [
            models.Index(fields=["user", "image_type", "-created_at"]),
        ]

    def __str__(self):
        return f"<UserImage:{self.id} {self.image_type}>"


class UserFieldChange(BaseModel):
    class Source(models.TextChoices):
        SELF = "self", "self"
        CONNECTED_TEACHER = "connected_teacher", "connected_teacher"
        ADMIN = "admin", "admin"

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="field_changes",
    )
    actor = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="authored_field_changes",
    )
    field_key = models.CharField(max_length=64)
    old_value = models.TextField(null=True, blank=True)
    new_value = models.TextField(null=True, blank=True)
    source = models.CharField(max_length=32, choices=Source.choices)

    class Meta:
        indexes = [
            models.Index(fields=["user", "-created_at"]),
        ]

    def __str__(self):
        return f"<UserFieldChange:{self.id} {self.field_key}>"


class UserTeachingSubject(BaseModel):
    """Teaching qualification: a subject, program level, or category."""

    class EntityType(models.TextChoices):
        SUBJECT = "subject", "Subject"
        PROGRAM_LEVEL = "program_level", "Program level"
        CATEGORY = "category", "Category"

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="teaching_subjects",
    )
    entity_type = models.CharField(
        max_length=32,
        choices=EntityType.choices,
        default=EntityType.SUBJECT,
    )
    subject = models.ForeignKey(
        "app_course.Subject",
        on_delete=models.PROTECT,
        related_name="user_teaching_subjects",
        null=True,
        blank=True,
    )
    program_level = models.ForeignKey(
        "app_course.ProgramLevel",
        on_delete=models.PROTECT,
        related_name="user_teaching_subjects",
        null=True,
        blank=True,
    )
    category = models.ForeignKey(
        "app_course.Category",
        on_delete=models.PROTECT,
        related_name="user_teaching_subjects",
        null=True,
        blank=True,
    )
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "created_at"]
        constraints = [
            models.CheckConstraint(
                check=(
                    models.Q(
                        entity_type="subject",
                        subject__isnull=False,
                        program_level__isnull=True,
                        category__isnull=True,
                    )
                    | models.Q(
                        entity_type="program_level",
                        program_level__isnull=False,
                        subject__isnull=True,
                        category__isnull=True,
                    )
                    | models.Q(
                        entity_type="category",
                        category__isnull=False,
                        subject__isnull=True,
                        program_level__isnull=True,
                    )
                ),
                name="user_teaching_subject_entity_fk_consistency",
            ),
            models.UniqueConstraint(
                fields=["user", "subject"],
                condition=models.Q(entity_type="subject"),
                name="uniq_user_teaching_subject_user_subject",
            ),
            models.UniqueConstraint(
                fields=["user", "program_level"],
                condition=models.Q(entity_type="program_level"),
                name="uniq_user_teaching_subject_user_program_level",
            ),
            models.UniqueConstraint(
                fields=["user", "category"],
                condition=models.Q(entity_type="category"),
                name="uniq_user_teaching_subject_user_category",
            ),
        ]

    def __str__(self):
        return f"<UserTeachingSubject:{self.id} user={self.user_id}>"


class UserCodeCounter(BaseModel):
    type_digit = models.CharField(max_length=1)
    year = models.PositiveSmallIntegerField()
    next_sequence = models.PositiveIntegerField(default=1)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["type_digit", "year"],
                name="uniq_user_code_counter_type_year",
            )
        ]


class Visibility(BaseModel):
    """
    This is different from the User's roles. This is just for frontend visibility of certain components.
    """

    name = models.CharField(max_length=512, unique=True)
    settings = models.JSONField()
    role = models.CharField(choices=User.UserRole.choices, max_length=32, unique=True)
    created_by = models.ForeignKey(
        "app_auth.User", on_delete=models.CASCADE, related_name="visibilities"
    )


class VerificationCode(BaseModel):
    class Source(models.TextChoices):
        PASSWORD_RESET = "password_reset", "password_reset"
        EMAIL_VERIFICATION = "email_verification", "email_verification"

    email = models.EmailField()
    token = models.CharField(max_length=512, null=True)
    digit_code = models.CharField(max_length=6, null=True)
    is_used = models.BooleanField(default=False)
    source = models.CharField(
        choices=Source.choices, max_length=64, default=Source.PASSWORD_RESET
    )

    class Meta:
        ordering = ("id",)


class DataVerificationRequest(BaseModel):
    """
    A DVR can be created by an admin to verify the data of a user.
    """

    name = models.CharField(max_length=512, unique=True)
    fields = models.JSONField(null=True, blank=True)
    expires_on = models.DateField(null=True, blank=True)
    created_by = models.ForeignKey(
        "app_auth.User", on_delete=models.SET_NULL, related_name="user_created_dvrs", null=True
    )
    requested_user_types = ArrayField(models.CharField(choices=User.UserRole.choices, max_length=32), null=True,
                                      blank=True)


class UserDataVerificationRequest(BaseModel):
    class Status(models.TextChoices):
        PENDING = "pending", "pending"
        AWAITING_VERIFICATION = "awaiting_verification", "awaiting_verification"
        VERIFIED = "verified", "verified"
        REJECTED = "rejected", "rejected"

    user = models.ForeignKey(
        "app_auth.User", on_delete=models.CASCADE, related_name="user_dvrs"
    )
    data_verification_request = models.ForeignKey(
        "app_auth.DataVerificationRequest", on_delete=models.CASCADE, related_name="user_dvrs"
    )
    status = models.CharField(choices=Status.choices, max_length=32, default=Status.PENDING)

    class Meta:
        ordering = ("id",)
        unique_together = ("user", "data_verification_request")


class WebPushSubscription(BaseModel):
    """
    Web Push notification subscription for a user.
    Stores the subscription data needed to send web push notifications.
    """
    user = models.ForeignKey(
        "app_auth.User",
        on_delete=models.CASCADE,
        related_name="web_push_subscriptions"
    )
    endpoint = models.URLField(max_length=512)
    p256dh = models.TextField()  # Public key for encryption
    auth = models.TextField()   # Authentication secret
    is_active = models.BooleanField(default=True)
    user_agent = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ("id",)
        constraints = [
            models.UniqueConstraint(
                fields=["user", "endpoint"],
                name="unique_user_endpoint_web_push",
            )
        ]

    def __str__(self):
        return f"WebPushSubscription: {self.user.email} - {self.endpoint}"


class ClientType(models.TextChoices):
    WEB = "web", "Web"
    MOBILE_NATIVE = "mobile_native", "Mobile native"


class MobileDevice(BaseModel):
    """
    Registry of native mobile app installations per user.
    Linked to RefreshSession for single-device enforcement (when enabled).
    """

    user = models.ForeignKey(
        "app_auth.User",
        on_delete=models.CASCADE,
        related_name="mobile_devices",
    )
    installation_id = models.UUIDField(db_index=True)
    display_name = models.CharField(max_length=256)
    device_model = models.CharField(max_length=128, null=True, blank=True)
    os_name = models.CharField(max_length=64, null=True, blank=True)
    os_version = models.CharField(max_length=64, null=True, blank=True)
    app_version = models.CharField(max_length=32, null=True, blank=True)
    first_seen_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(default=timezone.now)
    is_active = models.BooleanField(default=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-last_seen_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["user", "installation_id"],
                name="unique_user_mobile_installation",
            ),
        ]

    def __str__(self):
        return f"MobileDevice: {self.user_id} - {self.display_name}"


class RefreshSession(BaseModel):
    """
    Server-backed refresh session for rotation, expiry, and per-device revocation.
    """

    user = models.ForeignKey(
        "app_auth.User",
        on_delete=models.CASCADE,
        related_name="refresh_sessions",
    )
    session_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False, db_index=True)
    refresh_jti = models.CharField(max_length=64, db_index=True)
    schema_name = models.CharField(max_length=63)
    remembered = models.BooleanField(default=False)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)
    user_agent = models.TextField(null=True, blank=True)
    device_name = models.CharField(max_length=256, null=True, blank=True)
    client_type = models.CharField(
        max_length=32,
        choices=ClientType.choices,
        default=ClientType.WEB,
    )
    mobile_device = models.ForeignKey(
        "MobileDevice",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="sessions",
    )
    revoked_reason = models.CharField(max_length=64, null=True, blank=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["user", "schema_name", "revoked_at"]),
        ]


from app_auth.models_user_ai import UserAIPreferences  # noqa: E402
from app_auth.models_user_zoom_oauth import UserZoomOAuth  # noqa: E402
from app_auth.models_user_google_calendar_oauth import UserGoogleCalendarOAuth  # noqa: E402
from app_auth.models_user_microsoft_oauth import UserMicrosoftOAuth  # noqa: E402
