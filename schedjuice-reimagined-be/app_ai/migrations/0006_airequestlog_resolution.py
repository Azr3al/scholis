from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app_ai", "0005_airequestlog_thinking_steps"),
    ]

    operations = [
        migrations.AddField(
            model_name="airequestlog",
            name="resolved_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="airequestlog",
            name="resolved_by_user_id",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
    ]
