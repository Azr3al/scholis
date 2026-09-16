from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app_auth", "0054_alter_user_date_of_birth_optional"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="microsoft_license_assigned",
            field=models.BooleanField(default=True),
        ),
    ]
