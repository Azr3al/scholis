from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_auth", "0058_alter_user_phone_number_lengths"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="user",
            name="telegram_id",
        ),
        migrations.RemoveField(
            model_name="verificationcode",
            name="telegram_id",
        ),
        migrations.AlterField(
            model_name="verificationcode",
            name="source",
            field=models.CharField(
                choices=[
                    ("password_reset", "password_reset"),
                    ("email_verification", "email_verification"),
                ],
                default="password_reset",
                max_length=64,
            ),
        ),
    ]
