from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_organization", "0089_microsoft_delegated_oauth"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="is_google_on",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="organization",
            name="is_google_login_on",
            field=models.BooleanField(
                default=False,
                help_text="Allow sign-in via Google (requires linked account).",
            ),
        ),
    ]
