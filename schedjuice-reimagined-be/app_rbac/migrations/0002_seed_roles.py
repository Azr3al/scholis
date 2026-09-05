from django.db import migrations


def forwards(apps, schema_editor):
    # Import the live seeder; it is idempotent and safe under migrate_schemas (runs per tenant).
    from app_rbac.seeding import seed_rbac
    seed_rbac()


def backwards(apps, schema_editor):
    Role = apps.get_model("app_rbac", "Role")
    Role.objects.filter(is_system=True).delete()


class Migration(migrations.Migration):
    dependencies = [("app_rbac", "0001_initial")]
    operations = [migrations.RunPython(forwards, backwards)]
