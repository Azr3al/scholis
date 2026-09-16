from django.db import migrations


def forwards(apps, schema_editor):
    from app_rbac.seeding import seed_rbac

    seed_rbac()


class Migration(migrations.Migration):
    dependencies = [("app_rbac", "0012_ai_telegram_use")]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
