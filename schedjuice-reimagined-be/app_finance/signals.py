"""Set billing cycle anchors when students enroll mid-term."""

from __future__ import annotations

from django.db import connection
from django.db.models.signals import post_save
from django.dispatch import receiver
from tenant_schemas.utils import get_public_schema_name

from app_course.models import UserCourse
from app_finance.enrollment_anchor import resolve_anchor_for_enrollment


@receiver(post_save, sender=UserCourse)
def set_billing_cycle_anchor_on_enrollment(
    sender,
    instance: UserCourse,
    created: bool,
    **kwargs,
):
    if not created:
        return
    if connection.schema_name == get_public_schema_name():
        return
    if instance.assigned_as != UserCourse.AssignedAs.STUDENT:
        return
    if instance.billing_cycle_anchor_date is not None:
        return

    anchor = resolve_anchor_for_enrollment(instance)
    if anchor is None:
        return

    UserCourse.objects.filter(pk=instance.pk).update(
        billing_cycle_anchor_date=anchor
    )
