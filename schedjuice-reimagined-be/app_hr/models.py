from django.db import models
from app_auth.models import User
from app_course.models import Campus
from utilitas.models import BaseModel
from schedjuice_backend.storages import PrivateMediaStorage
from schedjuice_backend.helpers import get_tenant_specific_upload_folder


def get_tenant_specific_upload_folder_for_campus_checkin_image(instance, filename):
    return get_tenant_specific_upload_folder(filename, "campus_checkin_images")


class BuildingCheckin(BaseModel):
    class VerificationMethod(models.TextChoices):
        GEO = "geo", "geo"
        SELFIE = "selfie", "selfie"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="building_checkins")
    date = models.DateField()
    actual_checkin_time = models.DateTimeField(null=True, blank=True)
    actual_checkout_time = models.DateTimeField(null=True, blank=True)
    campus = models.ForeignKey(
        Campus, on_delete=models.SET_NULL, null=True, blank=True, related_name="building_checkins"
    )
    checkin_image = models.ImageField(
        upload_to=get_tenant_specific_upload_folder_for_campus_checkin_image,
        null=True,
        blank=True,
        storage=PrivateMediaStorage(),
    )
    checkout_image = models.ImageField(
        upload_to=get_tenant_specific_upload_folder_for_campus_checkin_image,
        null=True,
        blank=True,
        storage=PrivateMediaStorage(),
    )
    checkin_verification_method = models.CharField(
        max_length=16, choices=VerificationMethod.choices, null=True, blank=True
    )
    checkout_verification_method = models.CharField(
        max_length=16, choices=VerificationMethod.choices, null=True, blank=True
    )
    checkin_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    checkin_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    checkout_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    checkout_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    class Meta:
        unique_together = ("user", "date")
        ordering = ("id",)
