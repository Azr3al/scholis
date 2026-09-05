import uuid

from django.db import models
from rest_framework.exceptions import ValidationError

from utilitas.models import BaseModel


class Item(BaseModel):
    """
    Represents a file or a link that can be attached to a course or a folder.
    """

    class ItemType(models.TextChoices):
        FILE = "file", "file"
        CONTENT = "content", "content"
        LINK = "link", "link"

    name = models.CharField(max_length=1024)
    code = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    content = models.JSONField(null=True, blank=True)
    url = models.CharField(
        max_length=1024,
        null=True,
        blank=True,
        help_text="If this is a link, provide the URL here.",
    )
    is_folder = models.BooleanField(default=False)
    item_type = models.CharField(choices=ItemType.choices, max_length=64, null=True)

    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        related_name="children",
        null=True,
        blank=True,
    )
    course = models.ForeignKey(
        "app_course.Course",
        on_delete=models.CASCADE,
        related_name="items",
        null=True,
        blank=True,
    )
    created_by = models.ForeignKey(
        "app_auth.User",
        on_delete=models.CASCADE,
        related_name="created_items",
        null=True,
        blank=True,
    )

    def save(self, *args, **kwargs):
        if self.parent and not self.parent.is_folder:
            raise ValidationError({"parent": "Parent must be a folder."})
        return super().save(*args, **kwargs)
