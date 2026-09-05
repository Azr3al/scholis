from django.db import connection, migrations


def forwards(apps, schema_editor):
    Role = apps.get_model("app_rbac", "Role")
    RolePermission = apps.get_model("app_rbac", "RolePermission")
    teacher = Role.objects.filter(slug="teacher", is_system=True).first()
    if teacher:
        RolePermission.objects.get_or_create(
            role=teacher,
            permission_code="course.manage_members",
        )
    from app_rbac.cache import bump_matrix_generation

    bump_matrix_generation(getattr(connection, "schema_name", None) or "public")


def backwards(apps, schema_editor):
    Role = apps.get_model("app_rbac", "Role")
    RolePermission = apps.get_model("app_rbac", "RolePermission")
    teacher = Role.objects.filter(slug="teacher", is_system=True).first()
    if teacher:
        RolePermission.objects.filter(
            role=teacher,
            permission_code="course.manage_members",
        ).delete()
    from app_rbac.cache import bump_matrix_generation

    bump_matrix_generation(getattr(connection, "schema_name", None) or "public")


class Migration(migrations.Migration):
    dependencies = [("app_rbac", "0004_hr_course_view_all")]
    operations = [migrations.RunPython(forwards, backwards)]
