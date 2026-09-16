# app_rbac_audit/models.py
from django.contrib.postgres.fields import ArrayField
from django.db import models


class ShadowDenial(models.Model):
    schema_name = models.CharField(max_length=128)
    view_name = models.CharField(max_length=256)
    path_pattern = models.CharField(max_length=256)
    method = models.CharField(max_length=8)
    missing_codes = ArrayField(models.CharField(max_length=128))
    role_signature = models.CharField(max_length=256)
    legacy_allowed = models.BooleanField(default=True)
    hit_count = models.PositiveIntegerField(default=1)
    first_seen = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(auto_now=True)
    sample = models.JSONField(default=dict)

    class Meta:
        unique_together = ("schema_name", "view_name", "method", "role_signature", "missing_codes")
