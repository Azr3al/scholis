# Generated manually for Task 1 (Messenger parity models)

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_chat", "0002_rename_app_chat_course_created_idx_app_chat_co_course__57dd64_idx"),
    ]

    operations = [
        migrations.AddField(
            model_name="coursechatmessage",
            name="edited_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="coursechatmessage",
            name="deleted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="coursechatmessage",
            name="deleted_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="chat_messages_deleted",
                to="app_auth.user",
            ),
        ),
        migrations.AddField(
            model_name="coursechatmessage",
            name="reply_to",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="replies",
                to="app_chat.coursechatmessage",
            ),
        ),
        migrations.CreateModel(
            name="CourseChatReadState",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("last_read_message_id", models.BigIntegerField()),
                (
                    "course",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="chat_read_states",
                        to="app_course.course",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="course_chat_read_states",
                        to="app_auth.user",
                    ),
                ),
            ],
        ),
        migrations.AddIndex(
            model_name="coursechatreadstate",
            index=models.Index(
                fields=["course", "user"],
                name="app_chat_cochatread_course_user_idx",
            ),
        ),
        migrations.AddConstraint(
            model_name="coursechatreadstate",
            constraint=models.UniqueConstraint(
                fields=("user", "course"),
                name="uniq_chat_read_user_course",
            ),
        ),
    ]
