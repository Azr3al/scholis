import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_chat", "0012_finalize_chat_message_reaction"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.DeleteModel(name="CourseChatMessage"),
                migrations.DeleteModel(name="CourseChatReadState"),
                migrations.DeleteModel(name="DirectMessage"),
                migrations.DeleteModel(name="DirectMessageReadState"),
                migrations.DeleteModel(name="DirectMessageThread"),
            ],
            database_operations=[
                migrations.AlterModelTable(
                    name="CourseChatMessage", table="legacy_app_chat_coursechatmessage"
                ),
                migrations.AlterModelTable(
                    name="CourseChatReadState",
                    table="legacy_app_chat_coursechatreadstate",
                ),
                migrations.AlterModelTable(
                    name="DirectMessage", table="legacy_app_chat_directmessage"
                ),
                migrations.AlterModelTable(
                    name="DirectMessageReadState",
                    table="legacy_app_chat_directmessagereadstate",
                ),
                migrations.AlterModelTable(
                    name="DirectMessageThread",
                    table="legacy_app_chat_directmessagethread",
                ),
            ],
        ),
        migrations.AlterField(
            model_name="chatmessage",
            name="user",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="chat_messages",
                to="app_auth.user",
            ),
        ),
        migrations.AlterField(
            model_name="chatmessage",
            name="deleted_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="chat_messages_deleted",
                to="app_auth.user",
            ),
        ),
        migrations.AlterField(
            model_name="chatreadstate",
            name="user",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="chat_read_states",
                to="app_auth.user",
            ),
        ),
    ]
