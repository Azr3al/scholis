from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app_auth", "0055_user_microsoft_license_assigned"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="profile_completeness",
            field=models.PositiveSmallIntegerField(default=0),
        ),
    ]
