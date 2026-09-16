from django.db import models
from utilitas.models import BaseModel
from schedjuice_backend.helpers import get_tenant_specific_upload_folder
from schedjuice_backend.storages import PublicMediaStorage, PrivateMediaStorage


def get_tenant_specific_upload_folder_for_attachment(instance, filename):
    return get_tenant_specific_upload_folder(filename, "attachments")


class Attachment(BaseModel):
    filename = models.CharField(max_length=5120)
    is_image = models.BooleanField()
    data = models.FileField(
        upload_to="",
        null=True,
        storage=PrivateMediaStorage(),
    )
    public_data = models.FileField(
        upload_to=get_tenant_specific_upload_folder_for_attachment,
        null=True,
        storage=PublicMediaStorage(),
    )
    file_type = models.CharField(max_length=100, null=True)

    size = models.PositiveBigIntegerField(null=True)
    table_name = models.CharField()
    foreign_key = models.PositiveBigIntegerField(null=True)
    is_deleted = models.BooleanField(default=False)
    access_count = models.PositiveBigIntegerField(default=1)
    last_accessed = models.DateTimeField(auto_now=True)

    news = models.ForeignKey(
        "app_announcement.News",
        on_delete=models.CASCADE,
        related_name="attachments",
        null=True,
    )
    assignment = models.ForeignKey(
        "app_course.Assignment",
        on_delete=models.CASCADE,
        related_name="attachments",
        null=True,
    )
    submission = models.ForeignKey(
        "app_course.Submission",
        on_delete=models.CASCADE,
        related_name="attachments",
        null=True,
    )
    quiz = models.ForeignKey(
        "app_quiz_v3.Quiz",
        on_delete=models.CASCADE,
        related_name="attachments",
        null=True,
        blank=True,
    )
    welcome_board = models.ForeignKey(
        "app_welcome_board.WelcomeBoard",
        on_delete=models.CASCADE,
        related_name="attachments",
        null=True,
        blank=True,
    )
