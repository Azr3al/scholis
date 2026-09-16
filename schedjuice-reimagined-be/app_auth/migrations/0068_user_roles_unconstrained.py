import django.contrib.postgres.fields
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_auth", "0067_useraipreferences"),
    ]

    operations = [
        migrations.AlterField(
            model_name="user",
            name="roles",
            field=django.contrib.postgres.fields.ArrayField(
                base_field=models.CharField(max_length=128),
                size=None,
            ),
        ),
    ]
