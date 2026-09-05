"""Tenant-scoped Google Calendar OAuth tokens for consultant scheduling."""

from __future__ import annotations

from django.conf import settings
from django.db import models

from utilitas.models import BaseModel


class UserGoogleCalendarOAuth(BaseModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        NEEDS_RECONNECT = "needs_reconnect", "Needs reconnect"
        DISCONNECTED = "disconnected", "Disconnected"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="google_calendar_oauth",
    )
    authorized_email = models.CharField(max_length=320, blank=True, default="")
    authorized_display_name = models.CharField(max_length=256, blank=True, default="")
    access_token_ct = models.TextField(blank=True, default="")
    refresh_token_ct = models.TextField(blank=True, default="")
    expires_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=32,
        choices=Status.choices,
        default=Status.ACTIVE,
    )
    last_error = models.TextField(blank=True, default="")

    class Meta:
        db_table = "app_auth_usergooglecalendaroauth"

    def __str__(self):
        return f"<UserGoogleCalendarOAuth user={self.user_id}>"

    @property
    def access_token(self) -> str:
        from app_google.crypto import decrypt_token

        return decrypt_token(self.access_token_ct)

    @property
    def refresh_token(self) -> str:
        from app_google.crypto import decrypt_token

        return decrypt_token(self.refresh_token_ct)

    def set_tokens(
        self,
        *,
        access_token: str | None = None,
        refresh_token: str | None = None,
        expires_at=None,
    ) -> None:
        from app_google.crypto import encrypt_token

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
