from django.db import models
from rest_framework.exceptions import ValidationError

from utilitas.models import BaseModel


class Department(BaseModel):
    name = models.CharField(max_length=1024, unique=True)
    description = models.TextField(blank=True, null=True)


class Job(BaseModel):
    name = models.CharField(max_length=1024, unique=True)
    description = models.TextField(blank=True, null=True)
    department = models.ForeignKey(
        Department, on_delete=models.PROTECT, related_name="jobs"
    )


class UserDepartment(BaseModel):
    user = models.ForeignKey(
        "app_auth.User", on_delete=models.CASCADE, related_name="user_departments"
    )
    department = models.ForeignKey(
        Department, on_delete=models.CASCADE, related_name="user_departments"
    )
    job = models.ForeignKey(
        Job, on_delete=models.PROTECT, related_name="user_departments"
    )
    is_leader = models.BooleanField(default=False)

    chosen_one_fields = ["is_leader"]

    def save(self, *args, **kwargs):
        if self.job.department != self.department:
            raise ValidationError(
                {"job": "The job department must be the same as the user department."}
            )
        return super().save(*args, **kwargs)
