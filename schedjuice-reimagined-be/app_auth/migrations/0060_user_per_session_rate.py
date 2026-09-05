from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_auth", "0059_remove_telegram_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="per_session_rate",
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                max_digits=12,
                null=True,
            ),
        ),
    ]
