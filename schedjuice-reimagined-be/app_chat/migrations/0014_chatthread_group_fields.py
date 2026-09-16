import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("app_chat", "0013_retire_legacy_chat_models"),
    ]

    operations = [
        migrations.AddField(
            model_name="chatthread",
            name="anchor_user",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="anchored_chat_threads",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="chatthread",
            name="group_key",
            field=models.CharField(blank=True, max_length=80, null=True),
        ),
        migrations.AddConstraint(
            model_name="chatthread",
            constraint=models.UniqueConstraint(
                condition=models.Q(("kind", "group")),
                fields=("group_key",),
                name="uniq_chat_thread_group_key",
            ),
        ),
    ]
