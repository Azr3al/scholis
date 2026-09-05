from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_auth", "0053_refreshsession"),
    ]

    operations = [
        migrations.AlterField(
            model_name="user",
            name="date_of_birth",
            field=models.DateField(blank=True, null=True),
        ),
    ]
