from django.db import models
from utilitas.models import BaseModel


class EmailTemplate(BaseModel):
    name = models.CharField(max_length=512)
    subject = models.CharField(max_length=512)
    body = models.JSONField()
    valid_variables = models.JSONField(blank=True, null=True)

    created_by = models.ForeignKey(
        "app_auth.User",
        on_delete=models.CASCADE,
        related_name="created_email_templates",
    )
    course = models.ForeignKey(
        "app_course.Course",
        on_delete=models.CASCADE,
        related_name="email_templates",
        null=True,
    )

    def __str__(self):
        return f"<EmailTemplate:{self.id}>"


class UserEmail(BaseModel):
    """
    Represents an email sent to a user
    """
    subject = models.CharField(max_length=512)
    json_body = models.JSONField()
    html_body = models.TextField(blank=True, null=True)
    is_bound = models.BooleanField(default=True,
                                   help_text="If True, the email is bound to a user in the organization, else the email field must be populated")
    is_sent = models.BooleanField(default=False)
    email = models.EmailField(null=True, blank=True)
    created_by = models.ForeignKey(
        "app_auth.User",
        on_delete=models.CASCADE,
        related_name="created_user_emails",
    )
    user = models.ForeignKey(
        "app_auth.User",
        on_delete=models.CASCADE,
        related_name="user_emails",
        null=True,
    )
    email_template = models.ForeignKey(
        EmailTemplate,
        on_delete=models.CASCADE,
        related_name="user_emails",
        null=True,
    )
