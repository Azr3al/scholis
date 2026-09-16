from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_organization", "0017_organization_is_public"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="grace_period",
            field=models.PositiveIntegerField(null=True, blank=True),
        ),
    ]



