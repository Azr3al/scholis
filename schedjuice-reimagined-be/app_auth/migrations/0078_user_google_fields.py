from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_auth", "0077_microsoft_delegated_oauth"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="google_id",
            field=models.CharField(blank=True, db_index=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name="user",
            name="google_linked_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
