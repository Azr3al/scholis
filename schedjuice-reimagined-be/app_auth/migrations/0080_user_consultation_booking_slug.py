from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_auth", "0079_user_google_calendar_oauth"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="consultation_booking_slug",
            field=models.CharField(blank=True, max_length=16, null=True, unique=True),
        ),
    ]
