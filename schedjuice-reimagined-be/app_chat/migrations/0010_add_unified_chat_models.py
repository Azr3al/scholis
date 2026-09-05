import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_course", "0059_usercourse_hourly_rate"),
        ("app_chat", "0009_remove_chatmessagereaction_uniq_chat_reaction_user_course_msg_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="ChatThread",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("kind", models.CharField(choices=[("course", "course"), ("dm", "dm"), ("group", "group")], max_length=10)),
                ("dm_pair_key", models.CharField(blank=True, max_length=40, null=True)),
                (
                    "course",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="chat_threads",
                        to="app_course.course",
                    ),
                ),
            ],
            options={"abstract": False},
        ),
        migrations.AddIndex(
            model_name="chatthread",
            index=models.Index(fields=["kind"], name="app_chat_thread_kind_idx"),
        ),
        migrations.AddConstraint(
            model_name="chatthread",
            constraint=models.UniqueConstraint(
                condition=models.Q(("kind", "course")),
                fields=("course",),
                name="uniq_chat_thread_course",
            ),
        ),
        migrations.AddConstraint(
            model_name="chatthread",
            constraint=models.UniqueConstraint(
                condition=models.Q(("kind", "dm")),
                fields=("dm_pair_key",),
                name="uniq_chat_thread_dm_pair",
            ),
        ),
        migrations.CreateModel(
            name="ChatThreadParticipant",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "thread",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="participants",
                        to="app_chat.chatthread",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="chat_thread_participations",
                        to="app_auth.user",
                    ),
                ),
            ],
            options={"abstract": False},
        ),
        migrations.AddIndex(
            model_name="chatthreadparticipant",
            index=models.Index(fields=["user", "thread"], name="app_chat_th_participant_idx"),
        ),
        migrations.AddConstraint(
            model_name="chatthreadparticipant",
            constraint=models.UniqueConstraint(
                fields=("thread", "user"), name="uniq_chat_thread_participant"
            ),
        ),
        migrations.CreateModel(
            name="ChatMessage",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("content", models.JSONField(help_text="Structured payload: {text, mentions, attachments}")),
                ("edited_at", models.DateTimeField(blank=True, null=True)),
                ("deleted_at", models.DateTimeField(blank=True, null=True)),
                (
                    "thread",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="messages",
                        to="app_chat.chatthread",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="chat_messages_v2",
                        to="app_auth.user",
                    ),
                ),
                (
                    "reply_to",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="replies",
                        to="app_chat.chatmessage",
                    ),
                ),
                (
                    "deleted_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="chat_messages_v2_deleted",
                        to="app_auth.user",
                    ),
                ),
            ],
            options={"ordering": ["created_at"]},
        ),
        migrations.AddIndex(
            model_name="chatmessage",
            index=models.Index(fields=["thread", "created_at"], name="app_chat_message_thread_idx"),
        ),
        migrations.CreateModel(
            name="ChatReadState",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("last_read_message_id", models.BigIntegerField(blank=True, null=True)),
                ("last_read_at", models.DateTimeField(blank=True, null=True)),
                (
                    "thread",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="read_states",
                        to="app_chat.chatthread",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="chat_read_states_v2",
                        to="app_auth.user",
                    ),
                ),
            ],
            options={"abstract": False},
        ),
        migrations.AddIndex(
            model_name="chatreadstate",
            index=models.Index(fields=["thread", "user"], name="app_chat_read_state_thread_idx"),
        ),
        migrations.AddConstraint(
            model_name="chatreadstate",
            constraint=models.UniqueConstraint(
                fields=("user", "thread"), name="uniq_chat_read_user_thread"
            ),
        ),
        migrations.AddField(
            model_name="chatmessagereaction",
            name="message",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="reactions_v2",
                to="app_chat.chatmessage",
            ),
        ),
    ]
