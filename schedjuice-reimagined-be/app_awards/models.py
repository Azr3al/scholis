import os

from django.db import connection, models
from django.db.models import Q, UniqueConstraint
from django.db.models.functions import Lower

from schedjuice_backend.storages import PublicMediaStorage
from utilitas.models import BaseModel


def get_upload_to_path_for_award_templates(instance, filename):
    schema = getattr(connection, "schema_name", "public")
    return os.path.join(schema, "award_templates", filename)


class AwardTitle(BaseModel):
    class Family(models.TextChoices):
        ACADEMIC_EXCELLENCE = "academic_excellence", "academic_excellence"
        ATTENDANCE = "attendance", "attendance"

    class Origin(models.TextChoices):
        ADMIN = "admin", "admin"
        PROMOTED = "promoted", "promoted"
        LOCAL = "local", "local"

    name = models.CharField(max_length=128)
    family = models.CharField(
        max_length=32, choices=Family.choices, null=True, blank=True
    )
    course = models.ForeignKey(
        "app_course.Course",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="local_award_titles",
    )
    is_pinned = models.BooleanField(default=False)
    origin = models.CharField(max_length=16, choices=Origin.choices)
    retired_at = models.DateTimeField(null=True, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey(
        "app_auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    class Meta:
        constraints = [
            UniqueConstraint(
                Lower("name"),
                condition=Q(course__isnull=True, retired_at__isnull=True),
                name="uniq_award_title_org_name_active",
            ),
            UniqueConstraint(
                "course",
                Lower("name"),
                condition=Q(course__isnull=False),
                name="uniq_award_title_local_name",
            ),
            models.CheckConstraint(
                check=(Q(is_pinned=False) | Q(is_pinned=True, course__isnull=True)),
                name="award_title_pinned_org_only",
            ),
            models.CheckConstraint(
                check=Q(family__isnull=True) | Q(course__isnull=True),
                name="award_title_family_org_only",
            ),
            models.CheckConstraint(
                check=Q(retired_at__isnull=True) | Q(course__isnull=True),
                name="award_title_retire_org_only",
            ),
            models.CheckConstraint(
                check=(
                    Q(origin="local", course__isnull=False)
                    | Q(origin__in=["admin", "promoted"], course__isnull=True)
                ),
                name="award_title_origin_course_consistency",
            ),
        ]
        ordering = ["sort_order", "name"]


class AwardGrant(BaseModel):
    class PeriodKind(models.TextChoices):
        MONTH = "month", "month"
        OVERALL = "overall", "overall"

    course = models.ForeignKey(
        "app_course.Course", on_delete=models.CASCADE, related_name="award_grants"
    )
    title = models.ForeignKey(
        AwardTitle, on_delete=models.PROTECT, related_name="grants"
    )
    user = models.ForeignKey(
        "app_auth.User", on_delete=models.CASCADE, related_name="award_grants"
    )
    period_kind = models.CharField(max_length=16, choices=PeriodKind.choices)
    year = models.PositiveIntegerField(null=True, blank=True)
    month = models.PositiveSmallIntegerField(null=True, blank=True)
    granted_by = models.ForeignKey(
        "app_auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    class Meta:
        constraints = [
            UniqueConstraint(
                fields=["course", "title", "user", "year", "month"],
                condition=Q(period_kind="month"),
                name="uniq_award_grant_month",
            ),
            UniqueConstraint(
                fields=["course", "title", "user"],
                condition=Q(period_kind="overall"),
                name="uniq_award_grant_overall",
            ),
            models.CheckConstraint(
                check=(
                    Q(period_kind="month", year__isnull=False, month__isnull=False)
                    | Q(period_kind="overall", year__isnull=True, month__isnull=True)
                ),
                name="award_grant_period_fields",
            ),
        ]


class AwardTemplate(BaseModel):
    title = models.OneToOneField(
        AwardTitle,
        on_delete=models.CASCADE,
        related_name="template",
    )
    name = models.CharField(max_length=128)
    background = models.ImageField(
        upload_to=get_upload_to_path_for_award_templates,
        storage=PublicMediaStorage(),
        null=True,
        blank=True,
    )
    document = models.JSONField(default=dict)
    created_by = models.ForeignKey(
        "app_auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    class Meta:
        pass
