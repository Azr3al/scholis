from django.db import migrations


def forwards(apps, schema_editor):
    from app_rbac.seeding import seed_rbac

    seed_rbac()


def backwards(apps, schema_editor):
    Role = apps.get_model("app_rbac", "Role")
    RolePermission = apps.get_model("app_rbac", "RolePermission")
    role = Role.objects.filter(slug="consultant", is_system=True).first()
    if role:
        RolePermission.objects.filter(role=role).delete()
        role.delete()
    from app_rbac.cache import bump_matrix_generation
    from django.db import connection

    bump_matrix_generation(getattr(connection, "schema_name", None) or "public")


class Migration(migrations.Migration):
    dependencies = [("app_rbac", "0017_payment_show_fee")]
    operations = [migrations.RunPython(forwards, backwards)]
