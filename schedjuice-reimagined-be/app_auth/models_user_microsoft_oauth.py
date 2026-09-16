"""Tenant-scoped Microsoft OAuth tokens for individual users (teacher delegated Graph)."""

from __future__ import annotations

from django.conf import settings
from django.db import models

from utilitas.models import BaseModel


class UserMicrosoftOAuth(BaseModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        NEEDS_RECONNECT = "needs_reconnect", "Needs reconnect"
        DISCONNECTED = "disconnected", "Disconnected"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="microsoft_oauth",
    )
    microsoft_object_id = models.CharField(max_length=128, blank=True, default="")
    authorized_upn = models.CharField(max_length=320, blank=True, default="")
    authorized_display_name = models.CharField(max_length=256, blank=True, default="")
    msal_cache_ct = models.TextField(blank=True, default="")
    expires_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=32,
        choices=Status.choices,
        default=Status.ACTIVE,
    )
    last_error = models.TextField(blank=True, default="")

    class Meta:
        db_table = "app_auth_usermicrosoftoauth"

    def __str__(self):
        return f"<UserMicrosoftOAuth user={self.user_id}>"

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
