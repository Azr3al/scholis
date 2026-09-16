from django.db import migrations


def forwards(apps, schema_editor):
    from app_rbac.seeding import seed_rbac

    seed_rbac()


def backwards(apps, schema_editor):
    from django.db import connection

    from app_rbac.cache import bump_matrix_generation

    bump_matrix_generation(getattr(connection, "schema_name", None) or "public")


class Migration(migrations.Migration):
    dependencies = [("app_rbac", "0016_payment_info_own_permissions")]
    operations = [migrations.RunPython(forwards, backwards)]
