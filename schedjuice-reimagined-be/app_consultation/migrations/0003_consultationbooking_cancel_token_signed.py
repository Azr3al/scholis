from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_consultation", "0002_consultation_booking_pending_status"),
    ]

    operations = [
        migrations.AddField(
            model_name="consultationbooking",
            name="cancel_token_signed",
            field=models.TextField(blank=True),
        ),
    ]
