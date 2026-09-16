import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_chat", "0011_populate_unified_chat_data"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="chatmessagereaction",
            name="uniq_chat_reaction_user_course_msg",
        ),
        migrations.RemoveConstraint(
            model_name="chatmessagereaction",
            name="uniq_chat_reaction_user_dm_msg",
        ),
        migrations.RemoveIndex(
            model_name="chatmessagereaction",
            name="app_chat_ch_course__39f694_idx",
        ),
        migrations.RemoveIndex(
            model_name="chatmessagereaction",
            name="app_chat_ch_direct__2de3dc_idx",
        ),
        migrations.RemoveField(
            model_name="chatmessagereaction",
            name="course_chat_message",
        ),
        migrations.RemoveField(
            model_name="chatmessagereaction",
            name="direct_message",
        ),
        migrations.AlterField(
            model_name="chatmessagereaction",
            name="message",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="reactions",
                to="app_chat.chatmessage",
            ),
        ),
        migrations.AlterField(
            model_name="chatmessagereaction",
            name="created_at",
            field=models.DateTimeField(auto_now_add=True),
        ),
        migrations.AlterField(
            model_name="chatmessagereaction",
            name="updated_at",
            field=models.DateTimeField(auto_now=True),
        ),
        migrations.AddIndex(
            model_name="chatmessagereaction",
            index=models.Index(fields=["message"], name="app_chat_reaction_message_idx"),
        ),
        migrations.AddConstraint(
            model_name="chatmessagereaction",
            constraint=models.UniqueConstraint(
                fields=("created_by", "message"), name="uniq_chat_reaction_user_message"
            ),
        ),
    ]
