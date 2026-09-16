from django.db import migrations


def forwards(apps, schema_editor):
    from app_rbac.seeding import seed_rbac

    seed_rbac()


def backwards(apps, schema_editor):
    Role = apps.get_model("app_rbac", "Role")
    RolePermission = apps.get_model("app_rbac", "RolePermission")
    manager = Role.objects.filter(slug="manager", is_system=True).first()
    if manager:
        RolePermission.objects.filter(
            role=manager,
            permission_code="payment.view_all",
        ).delete()
    from app_rbac.cache import bump_matrix_generation
    from django.db import connection

    bump_matrix_generation(getattr(connection, "schema_name", None) or "public")


class Migration(migrations.Migration):
    dependencies = [("app_rbac", "0010_attendance_manage_all")]
    operations = [migrations.RunPython(forwards, backwards)]
