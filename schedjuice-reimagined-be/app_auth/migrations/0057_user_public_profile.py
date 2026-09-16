from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app_auth", "0056_user_profile_completeness"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="qualifications",
            field=models.JSONField(
                blank=True,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="user",
            name="is_public_profile_enabled",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="user",
            name="public_profile_slug",
            field=models.CharField(
                blank=True,
                max_length=16,
                null=True,
                unique=True,
            ),
        ),
    ]
