from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_course", "0095_remove_teacher_course_reminder"),
    ]

    operations = [
        migrations.AddField(
            model_name="course",
            name="telegram_chat_id",
            field=models.BigIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="course",
            name="telegram_chat_title",
            field=models.CharField(blank=True, max_length=256, null=True),
        ),
        migrations.AddField(
            model_name="course",
            name="telegram_invite_link",
            field=models.CharField(blank=True, max_length=512, null=True),
        ),
        migrations.AddField(
            model_name="course",
            name="telegram_linked_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
