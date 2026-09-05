import uuid

from django.db import migrations, models


def backfill_id_verify_codes(apps, schema_editor):
    User = apps.get_model("app_auth", "User")
    for user in User.objects.filter(id_verify_code__isnull=True).iterator():
        for _ in range(10):
            code = f"v_{uuid.uuid4().hex[:8]}"
            if User.objects.filter(id_verify_code=code).exists():
                continue
            User.objects.filter(pk=user.pk, id_verify_code__isnull=True).update(
                id_verify_code=code
            )
            break


def clear_id_verify_codes(apps, schema_editor):
    User = apps.get_model("app_auth", "User")
    User.objects.update(id_verify_code=None)


class Migration(migrations.Migration):
    dependencies = [
        ("app_auth", "0081_userimage"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="id_verify_code",
            field=models.CharField(blank=True, max_length=12, null=True, unique=True),
        ),
        migrations.RunPython(backfill_id_verify_codes, clear_id_verify_codes),
    ]
