# Generated manually for Zoom Server-to-Server OAuth fields

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app_organization", "0043_organization_video_conferencing_platform"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="zoom_account_id",
            field=models.CharField(blank=True, max_length=512, null=True),
        ),
        migrations.AddField(
            model_name="organization",
            name="zoom_client_id",
            field=models.CharField(blank=True, max_length=512, null=True),
        ),
        migrations.AddField(
            model_name="organization",
            name="zoom_client_secret",
            field=models.CharField(blank=True, max_length=512, null=True),
        ),
    ]
