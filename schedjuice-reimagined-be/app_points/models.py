from django.db import models

from utilitas.models import BaseModel


class PointType(BaseModel):
    name = models.CharField(max_length=255)
    color = models.CharField(max_length=16, default="#64748b")
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]


class PointTransaction(BaseModel):
    subject = models.ForeignKey(
        "app_auth.User",
        on_delete=models.CASCADE,
        related_name="point_transactions",
    )
    point_type = models.ForeignKey(
        PointType,
        on_delete=models.PROTECT,
        related_name="transactions",
    )
    delta = models.IntegerField()
    note = models.TextField()
    actor = models.ForeignKey(
        "app_auth.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="point_transactions_given",
    )

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["subject", "point_type"]),
        ]
