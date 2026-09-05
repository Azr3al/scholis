from django.db import migrations


def forwards(apps, schema_editor):
    from app_rbac.seeding import seed_rbac

    seed_rbac()


def backwards(apps, schema_editor):
    Role = apps.get_model("app_rbac", "Role")
    RolePermission = apps.get_model("app_rbac", "RolePermission")
    codes = ["payment.view_unpaid", "payment.view_unpaid_all"]
    for slug in ("admin", "manager", "finance", "teacher"):
        role = Role.objects.filter(slug=slug, is_system=True).first()
        if role:
            RolePermission.objects.filter(role=role, permission_code__in=codes).delete()
    from app_rbac.cache import bump_matrix_generation
    from django.db import connection

    bump_matrix_generation(getattr(connection, "schema_name", None) or "public")


class Migration(migrations.Migration):
    dependencies = [("app_rbac", "0006_teacher_payment_record")]
    operations = [migrations.RunPython(forwards, backwards)]
