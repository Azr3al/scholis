from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_auth", "0061_user_resignation_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="telegram_user_id",
            field=models.BigIntegerField(blank=True, db_index=True, null=True),
        ),
        migrations.AddField(
            model_name="user",
            name="telegram_chat_id",
            field=models.BigIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="user",
            name="telegram_username",
            field=models.CharField(blank=True, max_length=64, null=True),
        ),
        migrations.AddField(
            model_name="user",
            name="telegram_linked_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
