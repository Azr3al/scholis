from django.db import migrations


def forwards(apps, schema_editor):
    from app_rbac.seeding import seed_rbac

    seed_rbac()


def backwards(apps, schema_editor):
    Role = apps.get_model("app_rbac", "Role")
    RolePermission = apps.get_model("app_rbac", "RolePermission")
    for role in Role.objects.filter(is_system=True):
        RolePermission.objects.filter(
            role=role,
            permission_code="course.assign_self_events",
        ).delete()
    from app_rbac.cache import bump_matrix_generation
    from django.db import connection

    bump_matrix_generation(getattr(connection, "schema_name", None) or "public")


class Migration(migrations.Migration):
    dependencies = [("app_rbac", "0006_teacher_payment_record")]
    operations = [migrations.RunPython(forwards, backwards)]
