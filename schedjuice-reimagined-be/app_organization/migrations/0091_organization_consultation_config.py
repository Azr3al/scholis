from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_organization", "0090_organization_google_flags"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="is_consultation_booking_on",
            field=models.BooleanField(
                default=False,
                help_text="Master switch for consultation booking.",
            ),
        ),
        migrations.AddField(
            model_name="organization",
            name="consultation_strategy",
            field=models.CharField(
                choices=[("lwtp", "lwtp")],
                default="lwtp",
                help_text="Strategy preset when a consultant applies default whitelist.",
                max_length=32,
            ),
        ),
    ]
