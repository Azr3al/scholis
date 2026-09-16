from django.db import migrations, models


def backfill_microsoft_display_name(apps, schema_editor):
    User = apps.get_model("app_auth", "User")
    for user in User.objects.filter(microsoft_display_name="").iterator():
        name = (user.name or "").strip()
        if not name:
            continue
        User.objects.filter(pk=user.pk).update(
            microsoft_display_name=name[:256],
        )


class Migration(migrations.Migration):
    dependencies = [
        ("app_auth", "0082_user_id_verify_code"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="microsoft_display_name",
            field=models.CharField(blank=True, default="", max_length=256),
        ),
        migrations.RunPython(
            backfill_microsoft_display_name,
            migrations.RunPython.noop,
        ),
    ]
